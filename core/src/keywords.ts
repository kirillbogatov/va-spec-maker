import { stem } from './stem';

export interface KeywordDef { name: string; synonyms: string[] }

const tokens = (s: string): { stem: string; start: number }[] =>
  [...s.matchAll(/[а-яёa-z0-9]+/gi)].map((m) => ({ stem: stem(m[0]), start: m.index! }));

/** Ключевые слова, чьи код или синонимы встречаются во фразе (по основам слов); порядок — по первому появлению, без повторов. */
export function matchKeywords(phrase: string, keywords: KeywordDef[]): string[] {
  const text = tokens(phrase);
  if (!text.length) return [];
  const found: { name: string; at: number }[] = [];
  for (const k of keywords) {
    let at = -1;
    for (const term of [k.name, ...k.synonyms]) {
      const t = tokens(term).map((x) => x.stem);
      if (!t.length) continue;
      for (let i = 0; i + t.length <= text.length; i++) {
        if (t.every((s, j) => text[i + j].stem === s)) {
          if (at === -1 || text[i].start < at) at = text[i].start;
          break;
        }
      }
    }
    if (at !== -1) found.push({ name: k.name, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}

export const cleanKeywordName = (v: string): string => v.replace(/^[\s$]+/, '').replace(/\s+/g, ' ').trim();

/** Синонимы: без пустых и повторов (без учёта регистра), порядок сохраняется. */
export function cleanSynonyms(list: string[]): string[] {
  const seen = new Set<string>();
  return list.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && !!seen.add(s.toLowerCase()));
}

/** Разбор txt: «КОД: синоним1, синоним2» по строке; пустые и «#…» пропускаются, строка без кода — в skipped, при дубле кода побеждает последняя. */
export function parseKeywordsTxt(text: string): { items: KeywordDef[]; skipped: number } {
  const byName = new Map<string, KeywordDef>();
  let skipped = 0;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    const name = cleanKeywordName(i === -1 ? line : line.slice(0, i));
    if (!name) { skipped++; continue; }
    const synonyms = cleanSynonyms(i === -1 ? [] : line.slice(i + 1).split(','));
    const key = name.toLowerCase();
    byName.delete(key);
    byName.set(key, { name, synonyms });
  }
  return { items: [...byName.values()], skipped };
}

export function keywordsToTxt(items: KeywordDef[]): string {
  return items.map((k) => `${k.name}:${k.synonyms.length ? ' ' + k.synonyms.join(', ') : ''}\n`).join('');
}
