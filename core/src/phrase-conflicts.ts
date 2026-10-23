export type ConflictKind = 'exact' | 'template';

export interface IntentForCheck {
  id: number;
  name: string;
  phrases: string[];
  /** Сущности интента: название и все слова (значения и синонимы). */
  entities: { name: string; words: string[] }[];
  scenarios: { id: number; name: string }[];
}

export interface ConflictSide { id: number; name: string; scenarios: { id: number; name: string }[] }
export interface ConflictPair {
  kind: ConflictKind;
  phrase: string;
  other_phrase: string;
  a: ConflictSide;
  b: ConflictSide;
}

const SERVICE_WORDS = new Set(['в', 'во', 'на', 'для', 'по', 'к', 'ко', 'с', 'со', 'у', 'из', 'до', 'за']);
const KIND_ORDER: Record<ConflictKind, number> = { exact: 0, template: 1 };

const tokenize = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

interface Entry { intent: IntentForCheck; phrase: string; text: string; template: string; followup: boolean }

/** Шаблон фразы: слова сущностей интента заменяются на {Название}, длинные значения первыми. */
function buildEntry(intent: IntentForCheck, phrase: string, dict: { tokens: string[]; name: string }[]): Entry | null {
  const tokens = tokenize(phrase);
  if (!tokens.length) return null;
  const out: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    const hit = dict.find((d) => d.tokens.every((t, k) => tokens[i + k] === t));
    if (hit) {
      out.push(`{${hit.name}}`);
      i += hit.tokens.length;
    } else {
      out.push(tokens[i++]);
    }
  }
  const slots = out.filter((t) => t.startsWith('{'));
  const followup = slots.length > 0 && out.every((t) => t.startsWith('{') || SERVICE_WORDS.has(t));
  return { intent, phrase, text: tokens.join(' '), template: (followup ? slots : out).join(' '), followup };
}

/** Пары интентов с совпадающими фразами: дословно или по шаблону с сущностями. Ответы на уточнение (только значение сущности) не учитываются. */
export function findPhraseConflicts(intents: IntentForCheck[]): ConflictPair[] {
  const entries: Entry[] = [];
  for (const intent of intents) {
    const dict = intent.entities
      .flatMap((e) => e.words.map((w) => ({ tokens: tokenize(w), name: e.name })))
      .filter((d) => d.tokens.length)
      .sort((x, y) => y.tokens.length - x.tokens.length);
    for (const phrase of intent.phrases) {
      const e = buildEntry(intent, phrase, dict);
      if (e) entries.push(e);
    }
  }

  const order = new Map(intents.map((i, n) => [i.id, n]));
  const side = (i: IntentForCheck): ConflictSide => ({ id: i.id, name: i.name, scenarios: i.scenarios });
  const seen = new Set<string>();
  const out: ConflictPair[] = [];
  const collect = (key: (e: Entry) => string, exact: boolean) => {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = key(e);
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          let [x, y] = [group[i], group[j]];
          if (x.intent.id === y.intent.id || x.followup || y.followup) continue;
          if (order.get(x.intent.id)! > order.get(y.intent.id)!) [x, y] = [y, x];
          const id = `${x.intent.id}|${x.phrase}|${y.intent.id}|${y.phrase}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const kind: ConflictKind = exact ? 'exact' : 'template';
          out.push({ kind, phrase: x.phrase, other_phrase: y.phrase, a: side(x.intent), b: side(y.intent) });
        }
      }
    }
  };
  collect((e) => e.text, true);
  collect((e) => e.template, false);

  return out.sort(
    (p, q) =>
      KIND_ORDER[p.kind] - KIND_ORDER[q.kind] ||
      p.a.name.localeCompare(q.a.name) ||
      p.b.name.localeCompare(q.b.name) ||
      p.phrase.localeCompare(q.phrase),
  );
}
