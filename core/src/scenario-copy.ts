import type { Db } from './sqlite';
import { badRequest, notFound } from './errors';
import { dumpProject } from './project-dump';
import { importScenario } from './scenario-import';

type Row = Record<string, any>;

/** Copy a scenario atomically, remapping all local IDs and editable prompts/intents. */
export function copyScenario(db: Db, projectId: number, sourceId: number, name: string, isTemplate: boolean) {
  const source = db.prepare('SELECT * FROM scenarios WHERE id = ? AND project_id = ?').get(sourceId, projectId) as Row | undefined;
  if (!source) throw notFound('Исходный сценарий');
  return db.transaction(() => {
    const insert = (table: string, row: Row) => {
      const { id: _id, ...data } = row;
      const keys = Object.keys(data);
      return Number(db.prepare(`INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .run(...keys.map(k => data[k])).lastInsertRowid);
    };
    const id = insert('scenarios', { ...source, name, is_template: Number(isTemplate) });
    const maps: Record<string, Map<number, number>> = { prompt_id: new Map(), intent_id: new Map(), part_id: new Map() };
    for (const [kind, table, children] of [
      ['prompt', 'prompts', []],
      ['intent', 'intents', ['intent_phrases', 'intent_patterns', 'intent_entities']],
    ] as const) {
      const col = `${kind}_id`;
      const references = db.prepare(`SELECT ${col} FROM scenario_${table} WHERE scenario_id = ?
        UNION SELECT ${col} FROM scenario_steps WHERE scenario_id = ? AND ${col} IS NOT NULL
        ${kind === 'prompt' ? 'UNION SELECT prompt_id FROM scenario_states WHERE scenario_id = ? AND prompt_id IS NOT NULL' : ''}`)
        .all(...(kind === 'prompt' ? [sourceId, sourceId, sourceId] : [sourceId, sourceId])) as Row[];
      const names = new Set((db.prepare(`SELECT name FROM ${table} WHERE project_id = ?`).all(projectId) as Row[]).map(r => r.name.trim().toLowerCase()));
      for (const ref of references) {
        const original = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(ref[col]) as Row;
        let candidate = `${original.name}_${name}`;
        let n = 2;
        while (names.has(candidate.trim().toLowerCase())) candidate = `${original.name}_${name}_${n++}`;
        names.add(candidate.trim().toLowerCase());
        const target = insert(table, { ...original, name: candidate, is_template: Number(isTemplate) });
        maps[col].set(original.id, target);
        for (const child of children) {
          for (const row of db.prepare(`SELECT * FROM ${child} WHERE intent_id = ? ORDER BY id`).all(original.id) as Row[]) {
            insert(child, { ...row, intent_id: target });
          }
        }
      }
    }
    for (const row of db.prepare('SELECT * FROM scenario_parts WHERE scenario_id = ? ORDER BY position, id').all(sourceId) as Row[]) {
      maps.part_id.set(row.id, insert('scenario_parts', { ...row, scenario_id: id }));
    }
    if (!maps.part_id.size) insert('scenario_parts', { scenario_id: id, position: 0, name });
    for (const table of ['scenario_intents', 'scenario_prompts', 'scenario_dependencies', 'scenario_entities', 'scenario_states', 'scenario_steps', 'scenario_changelog']) {
      for (const row of db.prepare(`SELECT * FROM ${table} WHERE scenario_id = ? ORDER BY id`).all(sourceId) as Row[]) {
        const copy: Row = { ...row, scenario_id: id };
        for (const [col, map] of Object.entries(maps)) if (copy[col] != null) copy[col] = map.get(copy[col]) ?? copy[col];
        // Dictionary dependencies remain shared project references, with one editor owner.
        if (table === 'scenario_dependencies' && copy.dictionary_id != null) copy.editable = 0;
        insert(table, copy);
      }
    }
    return { id, name };
  })();
}

/** Replace a scenario in another branch with this branch's scenario, remapping shared project resources by name. */
export function copyScenarioToBranch(db: Db, sourceId: number, targetScenarioId: number) {
  const get = (id: number) => db.prepare(`SELECT s.id, s.project_id, s.name, s.is_template, p.branch_group_id
    FROM scenarios s JOIN projects p ON p.id = s.project_id WHERE s.id = ?`).get(id) as
    | { id: number; project_id: number; name: string; is_template: number; branch_group_id: number }
    | undefined;
  const source = get(sourceId);
  const target = get(targetScenarioId);
  if (!source || !target) throw notFound('Сценарий');
  if (source.project_id === target.project_id || source.branch_group_id !== target.branch_group_id) {
    throw badRequest('Выберите сценарий из другой ветки этого проекта');
  }
  if (source.is_template || target.is_template) throw badRequest('Копирование между ветками доступно только для сценариев');
  return db.transaction(() => {
    return importScenario(db, target.project_id, dumpProject(db, source.project_id), source.id, { reuseExisting: true, scenarioId: target.id });
  })();
}
