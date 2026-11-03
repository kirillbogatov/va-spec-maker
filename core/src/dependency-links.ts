import type { Db } from './sqlite';
import { badRequest } from './errors';

interface DictionaryRow { id: number; name: string; description: string; values: string }
interface Dependency {
  ref: string; entity_id: number | null; name: string; description: string; type: string; options: string[];
  dictionary_id: number | null; editable: boolean;
}

/** Снимки нужны для экспорта и старых клиентов; справочник остаётся источником значений. */
export function updateDependencyCopies(db: Db, dictionaryId: number, name: string, values: string[], description: string) {
  db.prepare(`UPDATE scenario_dependencies SET name = ?, options = ?, description = ?,
    type = CASE WHEN type = 'bool' AND ? = '["true","false"]' THEN 'bool' ELSE ? END
    WHERE dictionary_id = ?`).run(name, JSON.stringify(values), description, JSON.stringify(values), values.length ? 'enum' : 'string', dictionaryId);
}

/** Переименовывает только структурированные условия связанных зависимостей во всех частях сценариев. */
export function renameDependencyValues(db: Db, dictionaryId: number, renames: { from: string; to: string }[]) {
  if (!renames.length) return;
  const links = db.prepare('SELECT scenario_id, ref FROM scenario_dependencies WHERE dictionary_id = ?').all(dictionaryId) as { scenario_id: number; ref: string }[];
  const refs = new Map<number, Set<string>>();
  for (const link of links) {
    if (!refs.has(link.scenario_id)) refs.set(link.scenario_id, new Set());
    refs.get(link.scenario_id)!.add(link.ref);
  }
  for (const [table, column] of [['scenario_steps', 'conditions'], ['scenario_parts', 'preconditions']] as const) {
    const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
    for (const [scenarioId, dependencies] of refs) {
      const rows = db.prepare(`SELECT id, ${column} AS conditions FROM ${table} WHERE scenario_id = ?`).all(scenarioId) as { id: number; conditions: string }[];
      for (const row of rows) {
        const conditions = JSON.parse(row.conditions) as { dep: string; value: string; entity_id?: number; concept_id?: number; keyword_id?: number }[];
        let changed = false;
        for (const c of conditions) {
          if (c.entity_id !== undefined || c.concept_id !== undefined || c.keyword_id !== undefined || !dependencies.has(c.dep)) continue;
          for (const rename of renames) {
            if (c.value === rename.from && rename.from !== rename.to) { c.value = rename.to; changed = true; }
          }
        }
        if (changed) update.run(JSON.stringify(conditions), row.id);
      }
    }
  }
}

/** Старые сценарии и дампы ещё не содержат ссылок на справочник. */
export function backfillDependencyLinks(db: Db, projectId?: number) {
  if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('scenario_dependencies', 'scenarios', 'dependency_dictionary')").all().length !== 3) return;
  const rows = db.prepare(`SELECT d.*, s.project_id FROM scenario_dependencies d JOIN scenarios s ON s.id = d.scenario_id
    WHERE d.dictionary_id IS NULL AND d.entity_id IS NULL AND TRIM(d.name) <> '' AND (? IS NULL OR s.project_id = ?)`)
    .all(projectId ?? null, projectId ?? null) as (Omit<Dependency, 'options'> & { id: number; project_id: number; options: string })[];
  for (const d of rows) {
    const existing = db.prepare('SELECT id, description, "values" FROM dependency_dictionary WHERE project_id = ? AND name = ?').get(d.project_id, d.name) as DictionaryRow | undefined;
    const values = existing ? JSON.parse(existing.values) as string[] : d.type === 'bool' ? ['true', 'false'] : JSON.parse(d.options) as string[];
    const dictionaryId = existing?.id ?? db.prepare('INSERT INTO dependency_dictionary(project_id,name,description,"values") VALUES (?,?,?,?)').run(d.project_id, d.name, d.description, JSON.stringify(values)).lastInsertRowid;
    const type = d.type === 'bool' && JSON.stringify(values) === '["true","false"]' ? 'bool' : values.length ? 'enum' : 'string';
    db.prepare('UPDATE scenario_dependencies SET dictionary_id = ?, editable = ?, description = ?, type = ?, options = ? WHERE id = ?')
      .run(dictionaryId, 0, existing?.description ?? d.description, type, JSON.stringify(type === 'bool' ? [] : values), d.id);
  }
}

/** Сохранение сценария меняет связи, а не общие записи: их редактирует отдельный редактор. */
export function syncScenarioDependencies(db: Db, projectId: number, dependencies: Dependency[], previous: Dependency[]) {
  for (const d of dependencies) {
    d.editable = false; // Поле оставлено для чтения старых дампов; прежнего права записи больше нет.
    if (d.entity_id !== null || !d.name.trim()) { d.dictionary_id = null; continue; }
    const old = previous.find((p) => p.ref === d.ref);
    const requestedId = d.dictionary_id ?? old?.dictionary_id ?? null;
    let record = requestedId == null
      ? db.prepare('SELECT id, name, description, "values" FROM dependency_dictionary WHERE project_id = ? AND name = ?').get(projectId, d.name) as DictionaryRow | undefined
      : db.prepare('SELECT id, name, description, "values" FROM dependency_dictionary WHERE project_id = ? AND id = ?').get(projectId, requestedId) as DictionaryRow | undefined;
    if (requestedId != null && !record) throw badRequest('Зависимость не найдена в справочнике проекта');
    if (!record) {
      const values = [...new Set(d.type === 'bool' ? ['true', 'false'] : d.options)];
      const result = db.prepare('INSERT INTO dependency_dictionary(project_id,name,description,"values") VALUES (?,?,?,?)').run(projectId, d.name, d.description, JSON.stringify(values));
      record = { id: Number(result.lastInsertRowid), name: d.name, description: d.description, values: JSON.stringify(values) };
    }
    const values = JSON.parse(record.values) as string[];
    d.dictionary_id = record.id;
    d.name = record.name;
    d.description = record.description;
    d.type = d.type === 'bool' && JSON.stringify(values) === '["true","false"]' ? 'bool' : values.length ? 'enum' : 'string';
    d.options = d.type === 'bool' ? [] : values;
  }
}
