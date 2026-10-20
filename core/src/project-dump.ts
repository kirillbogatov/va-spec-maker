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

/** Порядок важен: родители раньше детей. fk — столбцы-ссылки на id других таблиц дампа. */
const TABLES: { name: string; where: string; fk: Record<string, string> }[] = [
  { name: 'entities', where: IN_PROJECT, fk: {} },
  { name: 'entity_values', where: VIA_ENTITY, fk: { entity_id: 'entities' } },
  { name: 'dependency_dictionary', where: IN_PROJECT, fk: {} },
  { name: 'scenarios', where: IN_PROJECT, fk: {} },
  { name: 'scenario_parts', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios' } },
  { name: 'intents', where: IN_PROJECT, fk: { scenario_id: 'scenarios' } },
  { name: 'intent_phrases', where: VIA_INTENT, fk: { intent_id: 'intents' } },
  { name: 'intent_entities', where: VIA_INTENT, fk: { intent_id: 'intents', entity_id: 'entities' } },
  { name: 'prompts', where: IN_PROJECT, fk: { scenario_id: 'scenarios' } },
  { name: 'scenario_dependencies', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', entity_id: 'entities' } },
  { name: 'scenario_entities', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', entity_id: 'entities' } },
  { name: 'scenario_states', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', part_id: 'scenario_parts', prompt_id: 'prompts' } },
  { name: 'scenario_steps', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', part_id: 'scenario_parts', intent_id: 'intents', prompt_id: 'prompts' } },
];

export function dumpProject(db: Db, id: number): ProjectDump {
  const p = db.prepare('SELECT name, description FROM projects WHERE id = ?').get(id) as { name: string; description: string } | undefined;
  if (!p) throw notFound('Проект');
  const tables: ProjectDump['tables'] = {};
  for (const t of TABLES) tables[t.name] = db.prepare(`SELECT * FROM ${t.name} WHERE ${t.where}`).all(id);
  return { version: 1, name: p.name, description: p.description, tables };
}

/** Импорт: id пересоздаются, ссылки переписываются. Имена столбцов проверяются по схеме. */
export function importProject(db: Db, dump: ProjectDump, name?: string): number {
  if (!dump || dump.version !== 1 || typeof dump.name !== 'string' || !dump.tables || typeof dump.tables !== 'object') {
    throw badRequest('Файл не похож на экспорт проекта VA Spec Maker');
  }
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
      const rows = dump.tables[t.name];
      if (rows !== undefined && !Array.isArray(rows)) throw badRequest(`Некорректная таблица ${t.name}`);
      for (const row of rows ?? []) {
        const keys = Object.keys(row).filter((k) => k !== 'id');
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
