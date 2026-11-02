import { badRequest, notFound } from './errors';
import { importProject, type ProjectDump } from './project-dump';
import type { Db } from './sqlite';

/** Import a single scenario and its dictionary references using the project ID remapper. */
export function importScenario(db: Db, pid: number, dump: ProjectDump, sid: number) {
  if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
  if (!dump || dump.version !== 1 || typeof dump.name !== 'string' || !dump.tables || typeof dump.tables !== 'object') {
    throw badRequest('Выберите JSON-файл экспорта проекта');
  }
  const tables: ProjectDump['tables'] = {};
  for (const [name, rows] of Object.entries(dump.tables)) {
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw badRequest(`Некорректная таблица ${name}`);
    tables[name] = rows.filter(r => name === 'scenarios' ? r.id === sid : name.startsWith('scenario_') ? r.scenario_id === sid : true);
  }
  const scenario = tables.scenarios?.[0];
  if (!scenario) throw badRequest('Сценарий не найден в файле');
  const ids = (rows: Record<string, unknown>[], key: string) => new Set(rows.map(r => r[key]));
  const steps = tables.scenario_steps ?? [];
  const states = tables.scenario_states ?? [];
  const intentIds = ids([...(tables.scenario_intents ?? []), ...steps], 'intent_id');
  tables.intents = (tables.intents ?? []).filter(r => intentIds.has(r.id) || r.scenario_id === sid);
  const selectedIntents = ids(tables.intents, 'id');
  for (const key of ['intent_phrases', 'intent_patterns', 'intent_entities']) tables[key] = (tables[key] ?? []).filter(r => selectedIntents.has(r.intent_id));
  const promptIds = ids([...(tables.scenario_prompts ?? []), ...steps, ...states], 'prompt_id');
  tables.prompts = (tables.prompts ?? []).filter(r => promptIds.has(r.id) || r.scenario_id === sid);
  const conditions = steps.flatMap(r => {
    try { return JSON.parse(typeof r.conditions === 'string' ? r.conditions : JSON.stringify(r.conditions ?? [])); }
    catch { throw badRequest('Некорректные условия переходов'); }
  });
  const entityIds = ids([...(tables.scenario_entities ?? []), ...(tables.scenario_dependencies ?? []), ...(tables.intent_entities ?? []), ...conditions], 'entity_id');
  tables.entities = (tables.entities ?? []).filter(r => entityIds.has(r.id));
  tables.entity_values = (tables.entity_values ?? []).filter(r => entityIds.has(r.entity_id));
  const keywordIds = ids(conditions, 'keyword_id');
  const patterns = (tables.intent_patterns ?? []).map(r => String(r.text)).join(' ');
  tables.keywords = (tables.keywords ?? []).filter(r => keywordIds.has(r.id) || patterns.includes(String(r.name)));
  tables.dependency_dictionary = [];
  tables.project_settings = [];
  return db.transaction(() => {
    for (const table of ['entities', 'intents', 'prompts', 'keywords']) {
      for (const row of tables[table] ?? []) {
        if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id = ? AND name = ?`).get(pid, row.name)) {
          throw badRequest(`В проекте уже есть запись «${row.name}» (${table}). Переименуйте её или запись в файле и повторите импорт.`);
        }
      }
    }
    importProject(db, { ...dump, tables }, undefined, pid);
    return db.prepare('SELECT id, name FROM scenarios WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(pid) as { id: number; name: string };
  })();
}
