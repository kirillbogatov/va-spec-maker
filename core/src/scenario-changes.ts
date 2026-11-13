import type { Db } from './sqlite';

export type ScenarioChangeSource = 'entity' | 'dependency' | 'intent' | 'prompt' | 'result_code';

export interface ScenarioChange {
  id: number; source_type: ScenarioChangeSource; source_id: number; source_name: string; summary: string; created_at: string; reviewed_at: string | null;
}

export function initScenarioChanges(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS scenario_change_events (
    id INTEGER PRIMARY KEY,
    scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    source_name TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    reviewed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS scenario_change_events_pending ON scenario_change_events(scenario_id, resolved_at);`);
  try { db.exec('ALTER TABLE scenario_change_events ADD COLUMN reviewed_at TEXT'); } catch { /* Колонка уже есть в существующей базе. */ }
}

export function recordScenarioChanges(db: Db, scenarioIds: number[], sourceType: ScenarioChangeSource, sourceId: number, sourceName: string, summary: string): void {
  const insert = db.prepare('INSERT INTO scenario_change_events (scenario_id, source_type, source_id, source_name, summary) VALUES (?, ?, ?, ?, ?)');
  for (const scenarioId of new Set(scenarioIds)) insert.run(scenarioId, sourceType, sourceId, sourceName, summary);
}

export function affectedScenarioIds(db: Db, sourceType: ScenarioChangeSource, sourceId: number, projectId: number, sourceName = ''): number[] {
  if (sourceType === 'intent') return ids(db, 'SELECT DISTINCT s.id FROM scenarios s JOIN scenario_intents x ON x.scenario_id = s.id WHERE s.project_id = ? AND x.intent_id = ?', projectId, sourceId);
  if (sourceType === 'prompt') return ids(db, 'SELECT DISTINCT s.id FROM scenarios s JOIN scenario_prompts x ON x.scenario_id = s.id WHERE s.project_id = ? AND x.prompt_id = ?', projectId, sourceId);
  if (sourceType === 'dependency') return ids(db, 'SELECT DISTINCT s.id FROM scenarios s JOIN scenario_dependencies x ON x.scenario_id = s.id WHERE s.project_id = ? AND x.entity_id IS NULL AND (x.dictionary_id = ? OR (x.dictionary_id IS NULL AND x.name = ?))', projectId, sourceId, sourceName);
  if (sourceType === 'result_code') return ids(db, 'SELECT DISTINCT s.id FROM scenarios s JOIN scenario_states x ON x.scenario_id = s.id WHERE s.project_id = ? AND x.result_code = ?', projectId, sourceName);
  const out = new Set<number>(ids(db, 'SELECT DISTINCT s.id FROM scenarios s JOIN scenario_entities x ON x.scenario_id = s.id WHERE s.project_id = ? AND x.entity_id = ?', projectId, sourceId));
  for (const row of db.prepare('SELECT DISTINCT s.id, t.conditions FROM scenarios s JOIN scenario_steps t ON t.scenario_id = s.id WHERE s.project_id = ?').all(projectId) as { id: number; conditions: string }[]) if (hasReference(row.conditions, 'entity_id', sourceId)) out.add(row.id);
  for (const row of db.prepare('SELECT DISTINCT s.id, p.preconditions FROM scenarios s JOIN scenario_parts p ON p.scenario_id = s.id WHERE s.project_id = ?').all(projectId) as { id: number; preconditions: string }[]) if (hasReference(row.preconditions, 'entity_id', sourceId)) out.add(row.id);
  for (const id of ids(db, 'SELECT DISTINCT s.id FROM scenarios s JOIN scenario_intents si ON si.scenario_id = s.id JOIN intent_entities ie ON ie.intent_id = si.intent_id WHERE s.project_id = ? AND ie.entity_id = ?', projectId, sourceId)) out.add(id);
  return [...out];
}

export function scenarioChanges(db: Db, scenarioId: number): ScenarioChange[] {
  return db.prepare('SELECT id, source_type, source_id, source_name, summary, created_at, reviewed_at FROM scenario_change_events WHERE scenario_id = ? AND resolved_at IS NULL ORDER BY created_at, id').all(scenarioId) as ScenarioChange[];
}

export function reviewScenarioChanges(db: Db, scenarioId: number, changeIds: number[], reviewed: boolean): void {
  const ids = [...new Set(changeIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return;
  const marks = ids.map(() => '?').join(', ');
  db.prepare(`UPDATE scenario_change_events SET reviewed_at = ${reviewed ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE scenario_id = ? AND resolved_at IS NULL AND id IN (${marks})`).run(scenarioId, ...ids);
}

export function resolveScenarioChanges(db: Db, scenarioId: number): void {
  db.prepare('UPDATE scenario_change_events SET resolved_at = CURRENT_TIMESTAMP WHERE scenario_id = ? AND resolved_at IS NULL').run(scenarioId);
}

export function resolveProjectChanges(db: Db, projectId: number): void {
  db.prepare('UPDATE scenario_change_events SET resolved_at = CURRENT_TIMESTAMP WHERE resolved_at IS NULL AND scenario_id IN (SELECT id FROM scenarios WHERE project_id = ? AND is_template = 0)').run(projectId);
}

function ids(db: Db, sql: string, ...params: unknown[]): number[] { return (db.prepare(sql).all(...params) as { id: number }[]).map((row) => row.id); }
function hasReference(raw: string, key: string, id: number): boolean {
  try { const value = JSON.parse(raw) as Record<string, unknown>[]; return Array.isArray(value) && value.some((item) => Number(item?.[key]) === id); } catch { return false; }
}
