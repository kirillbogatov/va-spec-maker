import type { Db } from './sqlite';
import { matchKeywords, type KeywordDef } from './keywords';

/** Ссылка из записи истории на объект, к которому можно перейти. */
export interface HistoryRef {
  type: 'intent' | 'prompt' | 'state' | 'part' | 'dependency' | 'error';
  name: string;
  id?: number;
  /** Название вкладки сценария (для состояний, ошибок и самих вкладок). */
  part?: string;
}

export interface HistoryEntry { id: number; day: string; text: string; refs: HistoryRef[] }

/**
 * Одно изменение. Автосохранение шлёт каждую правку, поэтому записи за день склеиваются по `key`:
 * повторная правка того же объекта обновляет запись, а не добавляет новую.
 */
interface Change {
  key: string;
  text: string;
  refs?: HistoryRef[];
  /** Запись за сегодня с этим ключом отменяет изменение (добавили и удалили в тот же день). */
  cancels?: string;
  /** Если за сегодня уже есть запись с одним из этих ключей, изменение лишнее (правка только что добавленного). */
  absorbedBy?: string[];
  /** Записи за сегодня с этими ключами теряют смысл. */
  drops?: string[];
}

/** Сегодняшняя дата в формате ГГГГ-ММ-ДД по местному времени. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function record(db: Db, scenarioId: number, c: Change): void {
  const day = today();
  const find = db.prepare('SELECT id FROM scenario_history WHERE scenario_id = ? AND day = ? AND key = ?');
  const drop = (key: string) => db.prepare('DELETE FROM scenario_history WHERE scenario_id = ? AND day = ? AND key = ?').run(scenarioId, day, key);
  if (c.cancels && find.get(scenarioId, day, c.cancels)) {
    drop(c.cancels);
    return;
  }
  if (c.absorbedBy?.some((k) => find.get(scenarioId, day, k))) return;
  for (const k of c.drops ?? []) drop(k);
  const refs = JSON.stringify(c.refs ?? []);
  const row = find.get(scenarioId, day, c.key) as { id: number } | undefined;
  if (row) db.prepare('UPDATE scenario_history SET text = ?, refs = ? WHERE id = ?').run(c.text, refs, row.id);
  else db.prepare('INSERT INTO scenario_history(scenario_id, day, key, text, refs, at) VALUES (?, ?, ?, ?, ?, ?)').run(scenarioId, day, c.key, c.text, refs, new Date().toISOString());
}

export function listHistory(db: Db, scenarioId: number): HistoryEntry[] {
  return (db.prepare('SELECT id, day, text, refs FROM scenario_history WHERE scenario_id = ? ORDER BY day DESC, id DESC').all(scenarioId) as { id: number; day: string; text: string; refs: string }[]).map(
    (r) => ({ ...r, refs: JSON.parse(r.refs) as HistoryRef[] }),
  );
}

export function clearHistory(db: Db, scenarioId: number): void {
  db.prepare('DELETE FROM scenario_history WHERE scenario_id = ?').run(scenarioId);
}

// Помощники: добавление, удаление и правка одного объекта с общим ключом `id`
const added = (id: string, text: string, refs?: HistoryRef[]): Change => ({ key: `add:${id}`, text, refs, cancels: `del:${id}` });
const removed = (id: string, text: string, refs?: HistoryRef[]): Change => ({ key: `del:${id}`, text, refs, cancels: `add:${id}`, drops: [`mod:${id}`] });
const changed = (id: string, text: string, refs?: HistoryRef[]): Change => ({ key: `mod:${id}`, text, refs, absorbedBy: [`add:${id}`] });
const set = (key: string, text: string, refs?: HistoryRef[]): Change => ({ key: `set:${key}`, text, refs });

export function logCreated(db: Db, scenarioId: number): void {
  record(db, scenarioId, set('created', 'Сценарий создан'));
}

/** Сценарий в том виде, в каком его отдаёт GET /scenarios/:id (нужные для сравнения поля). */
export interface ScenarioSnapshot {
  name: string;
  description: string;
  dependencies: { ref: string; entity_id: number | null; name: string; type: string; options: string[] }[];
  parts: {
    name: string;
    description: string;
    layout: Record<string, { description: string; prompt_id: number | null; system_action: string }>;
    steps: {
      name: string; kind: string; state: string; intent_id: number | null; request_params: string; condition: string;
      conditions: unknown[]; cond_mode: string; prompt_id: number | null; system_action: string; next_states: string;
    }[];
  }[];
}

/** Имена состояний вкладки: со схемы и из переходов (откуда и куда). */
function stateNames(part: ScenarioSnapshot['parts'][number]): Set<string> {
  const out = new Set(Object.keys(part.layout));
  for (const s of part.steps) {
    if (s.kind !== 'transition') continue;
    for (const n of [s.state, ...s.next_states.split(/[\s,;|]+|->|→/)]) if (n.trim() && n.trim() !== '-') out.add(n.trim());
  }
  return out;
}

const json = (v: unknown) => JSON.stringify(v);
const q = (s: string) => `«${s}»`;

/** Подпись зависимости: своё название, иначе название сущности, иначе идентификатор. */
function dependencyLabel(db: Db, d: ScenarioSnapshot['dependencies'][number]): string {
  if (d.name.trim()) return d.name;
  if (d.entity_id !== null) {
    const e = db.prepare('SELECT name FROM entities WHERE id = ?').get(d.entity_id) as { name: string } | undefined;
    if (e) return e.name;
  }
  return d.ref;
}

/** Строки одного вида: у каждой подпись (по ней сопоставляются до и после) и содержимое (по нему видно правку). */
function indexRows(rows: ScenarioSnapshot['parts'][number]['steps']) {
  const seen = new Map<string, number>();
  return rows.map((s) => {
    const base = s.kind === 'transition' ? `${s.state}|${s.intent_id}|${s.next_states}` : `${s.name}|${s.state}|${s.intent_id}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const { state, intent_id, next_states, kind, ...rest } = s;
    const content = s.kind === 'transition' ? { ...rest, name: '' } : { ...rest, next_states, state };
    return { sig: `${s.kind}:${base}#${n}`, content: json(content), step: s };
  });
}

/** Что изменилось в сценарии между двумя сохранениями. */
export function logScenarioChanges(db: Db, scenarioId: number, before: ScenarioSnapshot, after: ScenarioSnapshot): void {
  const log = (c: Change) => record(db, scenarioId, c);
  const intentName = (id: number | null) => (id === null ? null : (db.prepare('SELECT name FROM intents WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? null);
  const intentRef = (id: number | null): HistoryRef[] => {
    const name = intentName(id);
    return name === null || id === null ? [] : [{ type: 'intent', id, name }];
  };

  if (before.name !== after.name) log(set('name', `Название сценария изменено на ${q(after.name)}`));
  if (before.description !== after.description) log(set('description', 'Изменено описание сценария'));

  // Зависимости сопоставляются по идентификатору
  const depOf = (list: ScenarioSnapshot['dependencies']) => new Map(list.map((d) => [d.ref, d]));
  const depsBefore = depOf(before.dependencies);
  const depsAfter = depOf(after.dependencies);
  for (const [ref, d] of depsAfter) {
    const label = dependencyLabel(db, d);
    const refs: HistoryRef[] = [{ type: 'dependency', name: label }];
    const old = depsBefore.get(ref);
    if (!old) log(added(`dep:${ref}`, 'Добавлена зависимость {0}', refs));
    else if (json(old) !== json(d)) log(changed(`dep:${ref}`, 'Изменена зависимость {0}', refs));
  }
  for (const [ref, d] of depsBefore) if (!depsAfter.has(ref)) log(removed(`dep:${ref}`, `Удалена зависимость ${q(dependencyLabel(db, d))}`));

  // Вкладки сопоставляются по названию; оставшиеся с обеих сторон на тех же местах считаются переименованными
  const pairs: [ScenarioSnapshot['parts'][number], ScenarioSnapshot['parts'][number]][] = [];
  const oldLeft = before.parts.filter((p) => !after.parts.some((a) => a.name === p.name));
  const newLeft = after.parts.filter((p) => !before.parts.some((b) => b.name === p.name));
  for (const a of after.parts) {
    const same = before.parts.find((b) => b.name === a.name);
    if (same) pairs.push([same, a]);
  }
  for (const o of [...oldLeft]) {
    const i = before.parts.indexOf(o);
    const n = newLeft.find((x) => after.parts.indexOf(x) === i);
    if (!n) continue;
    pairs.push([o, n]);
    oldLeft.splice(oldLeft.indexOf(o), 1);
    newLeft.splice(newLeft.indexOf(n), 1);
    log(set(`part-name:${i}`, 'Переименована вкладка {0}', [{ type: 'part', name: n.name, part: n.name }]));
  }
  for (const p of newLeft) log(added(`part:${p.name}`, 'Добавлена вкладка {0}', [{ type: 'part', name: p.name, part: p.name }]));
  for (const p of oldLeft) log(removed(`part:${p.name}`, `Удалена вкладка ${q(p.name)}`));

  for (const [b, a] of pairs) {
    const where = a.name;
    const inPart = `${where}|`;
    if (b.description !== a.description) log(set(`part-desc:${where}`, 'Изменено описание вкладки {0}', [{ type: 'part', name: where, part: where }]));
    const stateRef = (name: string): HistoryRef[] => [{ type: 'state', name, part: where }];
    // Состояние существует, если оно есть на схеме или упомянуто в переходе: так первое сохранение старого сценария не плодит записей
    const namesBefore = stateNames(b);
    const namesAfter = stateNames(a);
    const blank = { description: '', prompt_id: null, system_action: '' };
    for (const name of namesAfter) {
      const st = a.layout[name] ?? blank;
      const old = b.layout[name] ?? blank;
      if (!namesBefore.has(name)) log(added(`state:${inPart}${name}`, 'Добавлено состояние {0}', stateRef(name)));
      else if (old.description !== st.description || old.prompt_id !== st.prompt_id || old.system_action !== st.system_action) {
        log(changed(`state:${inPart}${name}`, 'Изменено состояние {0}', stateRef(name)));
      }
    }
    for (const name of namesBefore) if (!namesAfter.has(name)) log(removed(`state:${inPart}${name}`, `Удалено состояние ${q(name)}`));

    const rowsBefore = new Map(indexRows(b.steps).map((r) => [r.sig, r]));
    const rowsAfter = indexRows(a.steps);
    const seen = new Set<string>();
    for (const r of rowsAfter) {
      seen.add(r.sig);
      const s = r.step;
      const id = `step:${inPart}${r.sig}`;
      const old = rowsBefore.get(r.sig);
      if (old && old.content === r.content) continue;
      const verb = old ? changed : added;
      const kindName = s.kind === 'transition' ? { add: 'Добавлен переход', mod: 'Изменён переход' } : s.kind === 'error' ? { add: 'Добавлена ошибка', mod: 'Изменена ошибка' } : { add: 'Добавлен глобальный переход', mod: 'Изменён глобальный переход' };
      const title = kindName[old ? 'mod' : 'add'];
      const intents = intentRef(s.intent_id);
      if (s.kind === 'transition') {
        const from = s.state.trim();
        const refs: HistoryRef[] = [...(from ? stateRef(from) : []), ...intents];
        const next = s.next_states.trim();
        const text = `${title} ${from ? '{0}' : '—'} → ${next ? q(next) : '—'}${intents.length ? ` по интенту {${from ? 1 : 0}}` : ''}`;
        log(verb(id, text, refs));
      } else if (s.kind === 'error') {
        const label = s.name.trim() || (s.state.trim() ? `в состоянии ${s.state.trim()}` : 'без названия');
        log(verb(id, `${title} {0}`, [{ type: 'error', name: label, part: where }]));
      } else {
        const label = s.name.trim() || intents[0]?.name || 'без названия';
        log(verb(id, `${title} {0}`, [{ type: 'part', name: label, part: where }]));
      }
    }
    for (const [sig, r] of rowsBefore) {
      if (seen.has(sig)) continue;
      const s = r.step;
      const label = s.kind === 'transition' ? `${s.state.trim() || '—'} → ${s.next_states.trim() || '—'}` : s.name.trim() || s.state.trim() || intentName(s.intent_id) || 'без названия';
      const title = s.kind === 'transition' ? 'Удалён переход' : s.kind === 'error' ? 'Удалена ошибка' : 'Удалён глобальный переход';
      log(removed(`step:${inPart}${sig}`, `${title} ${q(label)}`));
    }
  }
}

/** Подключение и отключение интента или промпта, смена флага «глобальный». */
export function logLink(db: Db, scenarioId: number, kind: 'intent' | 'prompt', id: number, action: 'connect' | 'disconnect' | 'global-on' | 'global-off'): void {
  const row = db.prepare(`SELECT name FROM ${kind === 'intent' ? 'intents' : 'prompts'} WHERE id = ?`).get(id) as { name: string } | undefined;
  if (!row) return;
  const what = kind === 'intent' ? 'интент' : 'промпт';
  const refs: HistoryRef[] = [{ type: kind, id, name: row.name }];
  const key = `link:${kind}:${id}`;
  if (action === 'connect') record(db, scenarioId, { key: `add:${key}`, text: `Подключён ${what} {0}`, refs, cancels: `del:${key}` });
  else if (action === 'disconnect') record(db, scenarioId, { key: `del:${key}`, text: `Отключён ${what} ${q(row.name)}`, cancels: `add:${key}` });
  else record(db, scenarioId, set(`global:${id}`, action === 'global-on' ? 'Интент {0} сделан глобальным' : 'Интент {0} больше не глобальный', refs));
}

interface IntentSnapshot {
  name: string; enabled: boolean; comment: string;
  values: { text: string; kind: string }[];
  entities: { entity_id: number; required: boolean }[];
}

/** Сохранение интента попадает в историю всех сценариев, к которым он подключён. */
export function logIntentChanges(db: Db, intentId: number, projectId: number, before: IntentSnapshot, after: IntentSnapshot): void {
  const scenarios = (db.prepare('SELECT scenario_id FROM scenario_intents WHERE intent_id = ?').all(intentId) as { scenario_id: number }[]).map((r) => r.scenario_id);
  if (!scenarios.length) return;
  const refs: HistoryRef[] = [{ type: 'intent', id: intentId, name: after.name }];
  const changes: Change[] = [];
  const id = `intent:${intentId}`;
  if (before.name !== after.name) changes.push(set(`${id}:name`, 'Интент переименован: {0}', refs));
  if (before.enabled !== after.enabled) changes.push(set(`${id}:enabled`, after.enabled ? 'Интент {0} включён' : 'Интент {0} отключён', refs));
  if (before.comment !== after.comment) changes.push(set(`${id}:comment`, 'Изменён комментарий интента {0}', refs));

  const valueKey = (v: { text: string; kind: string }) => `${v.kind}:${v.text}`;
  const had = new Set(before.values.map(valueKey));
  const has = new Set(after.values.map(valueKey));
  const noun = (kind: string) => (kind === 'pattern' ? 'паттерн' : 'фраза');
  for (const v of after.values) {
    if (!had.has(valueKey(v))) changes.push(added(`${id}:${valueKey(v)}`, `В интент {0} добавлен${v.kind === 'pattern' ? '' : 'а'} ${noun(v.kind)} ${q(v.text)}`, refs));
  }
  for (const v of before.values) {
    if (!has.has(valueKey(v))) changes.push(removed(`${id}:${valueKey(v)}`, `Из интента {0} удален${v.kind === 'pattern' ? '' : 'а'} ${noun(v.kind)} ${q(v.text)}`, refs));
  }

  const entityName = (eid: number) => (db.prepare('SELECT name FROM entities WHERE id = ?').get(eid) as { name: string } | undefined)?.name ?? `#${eid}`;
  const hadE = new Map(before.entities.map((e) => [e.entity_id, e]));
  const hasE = new Map(after.entities.map((e) => [e.entity_id, e]));
  for (const [eid, e] of hasE) {
    if (!hadE.has(eid)) changes.push(added(`${id}:entity:${eid}`, `В интент {0} добавлена сущность ${q(entityName(eid))}`, refs));
    else if (hadE.get(eid)!.required !== e.required) changes.push(changed(`${id}:entity:${eid}`, `В интенте {0} изменена обязательность сущности ${q(entityName(eid))}`, refs));
  }
  for (const eid of hadE.keys()) if (!hasE.has(eid)) changes.push(removed(`${id}:entity:${eid}`, `Из интента {0} удалена сущность ${q(entityName(eid))}`, refs));

  // Ключевые слова интента — те, что встречаются хотя бы в одной его фразе
  const keywords = (db.prepare('SELECT name, synonyms FROM keywords WHERE project_id = ?').all(projectId) as { name: string; synonyms: string }[]).map(
    (k): KeywordDef => ({ name: k.name, synonyms: JSON.parse(k.synonyms) as string[] }),
  );
  if (keywords.length) {
    const concepts = (s: IntentSnapshot) => new Set(s.values.filter((v) => v.kind === 'phrase').flatMap((v) => matchKeywords(v.text, keywords)));
    const was = concepts(before);
    const now = concepts(after);
    const plus = [...now].filter((c) => !was.has(c)).sort();
    const minus = [...was].filter((c) => !now.has(c)).sort();
    if (plus.length) changes.push({ key: `add:${id}:concepts:${plus.join(',')}`, text: `В интент {0} добавлен${plus.length > 1 ? 'ы' : 'о'} ${plus.length > 1 ? 'ключевые слова' : 'ключевое слово'} ${plus.join(', ')}`, refs, cancels: `del:${id}:concepts:${plus.join(',')}` });
    if (minus.length) changes.push({ key: `del:${id}:concepts:${minus.join(',')}`, text: `Из интента {0} удален${minus.length > 1 ? 'ы' : 'о'} ${minus.length > 1 ? 'ключевые слова' : 'ключевое слово'} ${minus.join(', ')}`, refs, cancels: `add:${id}:concepts:${minus.join(',')}` });
  }
  for (const sid of scenarios) for (const c of changes) record(db, sid, c);
}

/** Правка промпта попадает в историю всех сценариев, к которым он подключён. */
export function logPromptChanged(db: Db, promptId: number, before: { name: string; full_answers: string[] }, after: { name: string; full_answers: string[] }): void {
  if (before.name === after.name && json(before.full_answers) === json(after.full_answers)) return;
  const refs: HistoryRef[] = [{ type: 'prompt', id: promptId, name: after.name }];
  for (const r of db.prepare('SELECT scenario_id FROM scenario_prompts WHERE prompt_id = ?').all(promptId) as { scenario_id: number }[]) {
    record(db, r.scenario_id, changed(`prompt:${promptId}`, 'Изменён промпт {0}', refs));
  }
}
