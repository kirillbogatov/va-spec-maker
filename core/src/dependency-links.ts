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
      .run(dictionaryId, existing ? 0 : 1, existing?.description ?? d.description, type, JSON.stringify(type === 'bool' ? [] : values), d.id);
  }
}

/** Вызывается внутри транзакции сохранения сценария. Право редактирования берётся из сохранённой связи. */
export function syncScenarioDependencies(db: Db, projectId: number, dependencies: Dependency[], previous: Dependency[]) {
  for (const d of dependencies) {
    if (d.entity_id !== null || !d.name.trim()) { d.dictionary_id = null; d.editable = true; continue; }
    const old = previous.find((p) => p.ref === d.ref);
    const requestedId = d.dictionary_id ?? (old?.editable || old?.name === d.name ? old?.dictionary_id : null);
    let record = requestedId == null
      ? db.prepare('SELECT id, name, description, "values" FROM dependency_dictionary WHERE project_id = ? AND name = ?').get(projectId, d.name) as DictionaryRow | undefined
      : db.prepare('SELECT id, name, description, "values" FROM dependency_dictionary WHERE project_id = ? AND id = ?').get(projectId, requestedId) as DictionaryRow | undefined;
    if (requestedId != null && !record) throw badRequest('Зависимость не найдена в справочнике проекта');
    if (record) {
      d.editable = old?.dictionary_id === record.id && !!old.editable;
      if (d.editable) {
        const values = [...new Set(d.type === 'bool' ? ['true', 'false'] : d.options)];
        db.prepare('UPDATE dependency_dictionary SET name = ?, description = ?, "values" = ? WHERE id = ?').run(d.name, d.description, JSON.stringify(values), record.id);
        updateDependencyCopies(db, record.id, d.name, values, d.description);
        d.options = d.type === 'bool' ? [] : values;
      } else {
        d.name = record.name;
        d.description = record.description;
        d.options = JSON.parse(record.values) as string[];
        d.type = d.options.length ? 'enum' : 'string';
      }
      d.dictionary_id = record.id;
    } else {
      const values = [...new Set(d.type === 'bool' ? ['true', 'false'] : d.options)];
      const result = db.prepare('INSERT INTO dependency_dictionary(project_id,name,description,"values") VALUES (?,?,?,?)').run(projectId, d.name, d.description, JSON.stringify(values));
      d.dictionary_id = result.lastInsertRowid;
      d.editable = true;
    }
  }
  // Несколько строк одного сценария тоже должны получить окончательную версию справочника.
  for (const d of dependencies) {
    if (d.dictionary_id === null) continue;
    const record = db.prepare('SELECT name, description, "values" FROM dependency_dictionary WHERE id = ?').get(d.dictionary_id) as DictionaryRow;
    const values = JSON.parse(record.values) as string[];
    d.name = record.name;
    d.description = record.description;
    d.type = d.type === 'bool' && JSON.stringify(values) === '["true","false"]' ? 'bool' : values.length ? 'enum' : 'string';
    d.options = d.type === 'bool' ? [] : values;
  }
}
