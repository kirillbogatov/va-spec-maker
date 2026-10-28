import { badRequest, notFound } from './errors';
import type { Db } from './sqlite';

export interface ProjectDump {
  version: 1;
  name: string;
  description: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const IN_PROJECT = 'project_id = ?';
const VIA_SCENARIO = 'scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?)';
const VIA_INTENT = 'intent_id IN (SELECT id FROM intents WHERE project_id = ?)';
const VIA_ENTITY = 'entity_id IN (SELECT id FROM entities WHERE project_id = ?)';

/** Поля прошлых версий: в новой схеме их нет или они не используются. Из дампов выбрасываются. */
const LEGACY: Record<string, string[]> = { intents: ['scenario_id'], prompts: ['scenario_id', 'short_answers'], scenario_steps: ['any_intent'] };
const dropLegacy = (table: string, row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !LEGACY[table]?.includes(k)));

/** Дамп до подключений: собираем связи из владельцев и ссылок; «любой интент» у переходов становится ошибкой. */
function upgradeDump(tables: ProjectDump['tables']): ProjectDump['tables'] {
  if (tables.scenario_intents !== undefined || tables.scenario_prompts !== undefined) return tables;
  const rows = (name: string) => (Array.isArray(tables[name]) ? tables[name] : []);
  const links = (pairs: [unknown, unknown][], col: string) => {
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const [scenario, object] of pairs) {
      if (typeof scenario !== 'number' || typeof object !== 'number' || seen.has(`${scenario}|${object}`)) continue;
      seen.add(`${scenario}|${object}`);
      out.push({ scenario_id: scenario, [col]: object, position: 0 });
    }
    return out;
  };
  const steps = rows('scenario_steps');
  return {
    ...tables,
    scenario_intents: links([...rows('intents').map((i): [unknown, unknown] => [i.scenario_id, i.id]), ...steps.map((s): [unknown, unknown] => [s.scenario_id, s.intent_id])], 'intent_id'),
    scenario_prompts: links(
      [
        ...rows('prompts').map((p): [unknown, unknown] => [p.scenario_id, p.id]),
        ...steps.map((s): [unknown, unknown] => [s.scenario_id, s.prompt_id]),
        ...rows('scenario_states').map((s): [unknown, unknown] => [s.scenario_id, s.prompt_id]),
      ],
      'prompt_id',
    ),
    scenario_steps: steps.map((s) => (Number(s.any_intent) === 1 ? { ...s, kind: 'error', intent_id: null } : s)),
  };
}

/** В записях истории ссылки на интенты и промпты хранятся по id: после импорта id другие. */
function remapHistory(row: Record<string, unknown>, maps: Record<string, Map<number, number>>): Record<string, unknown> {
  let refs: { type?: string; id?: number }[] = [];
  try {
    refs = JSON.parse(String(row.refs));
  } catch {
    return row;
  }
  const next = refs.map((r) => {
    const map = r.type === 'intent' ? maps.intents : r.type === 'prompt' ? maps.prompts : undefined;
    if (!map || typeof r.id !== 'number') return r;
    const { id, ...rest } = r;
    const to = map.get(id);
    return to === undefined ? rest : { ...rest, id: to };
  });
  return { ...row, refs: JSON.stringify(next) };
}

/** Порядок важен: родители раньше детей. fk — столбцы-ссылки на id других таблиц дампа. */
const TABLES: { name: string; where: string; fk: Record<string, string>; remap?: (row: Record<string, unknown>, maps: Record<string, Map<number, number>>) => Record<string, unknown> }[] = [
  { name: 'entities', where: IN_PROJECT, fk: {} },
  { name: 'entity_values', where: VIA_ENTITY, fk: { entity_id: 'entities' } },
  { name: 'dependency_dictionary', where: IN_PROJECT, fk: {} },
  { name: 'keywords', where: IN_PROJECT, fk: {} },
  { name: 'scenarios', where: IN_PROJECT, fk: {} },
  { name: 'scenario_parts', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios' } },
  { name: 'intents', where: IN_PROJECT, fk: {} },
  { name: 'intent_phrases', where: VIA_INTENT, fk: { intent_id: 'intents' } },
  { name: 'intent_patterns', where: VIA_INTENT, fk: { intent_id: 'intents' } },
  { name: 'intent_entities', where: VIA_INTENT, fk: { intent_id: 'intents', entity_id: 'entities' } },
  { name: 'prompts', where: IN_PROJECT, fk: {} },
  { name: 'scenario_intents', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', intent_id: 'intents' } },
  { name: 'scenario_prompts', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', prompt_id: 'prompts' } },
  { name: 'scenario_dependencies', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', entity_id: 'entities' } },
  { name: 'scenario_entities', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', entity_id: 'entities' } },
  { name: 'scenario_states', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', part_id: 'scenario_parts', prompt_id: 'prompts' } },
  { name: 'scenario_steps', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', part_id: 'scenario_parts', intent_id: 'intents', prompt_id: 'prompts' } },
  { name: 'scenario_history', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios' }, remap: remapHistory },
  { name: 'scenario_changelog', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios' } },
];

export function dumpProject(db: Db, id: number): ProjectDump {
  const p = db.prepare('SELECT name, description FROM projects WHERE id = ?').get(id) as { name: string; description: string } | undefined;
  if (!p) throw notFound('Проект');
  const tables: ProjectDump['tables'] = {};
  for (const t of TABLES) tables[t.name] = (db.prepare(`SELECT * FROM ${t.name} WHERE ${t.where}`).all(id) as Record<string, unknown>[]).map((r) => dropLegacy(t.name, r));
  return { version: 1, name: p.name, description: p.description, tables };
}

/** Импорт: id пересоздаются, ссылки переписываются. Имена столбцов проверяются по схеме. */
export function importProject(db: Db, dump: ProjectDump, name?: string): number {
  if (!dump || dump.version !== 1 || typeof dump.name !== 'string' || !dump.tables || typeof dump.tables !== 'object') {
    throw badRequest('Файл не похож на экспорт проекта VA Spec Maker');
  }
  const tables = upgradeDump(dump.tables);
  return db.transaction(() => {
    const pid = Number(
      db
        .prepare('INSERT INTO projects(name, description) VALUES (?, ?)')
        .run(name ?? dump.name, typeof dump.description === 'string' ? dump.description : '').lastInsertRowid,
    );
    const maps: Record<string, Map<number, number>> = {};
    for (const t of TABLES) {
      const cols = new Set((db.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string }[]).map((c) => c.name));
      const map = (maps[t.name] = new Map());
      const rows = tables[t.name];
      if (rows !== undefined && !Array.isArray(rows)) throw badRequest(`Некорректная таблица ${t.name}`);
      for (const original of rows ?? []) {
        const row = t.remap ? t.remap(original, maps) : original;
        const keys = Object.keys(row).filter((k) => k !== 'id' && !LEGACY[t.name]?.includes(k));
        if (keys.some((k) => !cols.has(k))) throw badRequest(`Неизвестное поле в таблице ${t.name}`);
        const values = keys.map((k) => {
          if (k === 'project_id') return pid;
          const ref = t.fk[k];
          if (!ref) return row[k] as unknown;
          const old = row[k] as number | null;
          return old == null ? null : (maps[ref].get(old) ?? null);
        });
        const q = keys.map((k) => `"${k}"`).join(', ');
        const info = db.prepare(`INSERT INTO ${t.name}(${q}) VALUES (${keys.map(() => '?').join(', ')})`).run(...values);
        if (typeof row.id === 'number') map.set(row.id, Number(info.lastInsertRowid));
      }
    }
    return pid;
  })();
}
