import { openSqlite, type Db, type OpenOpts } from './sqlite';

export type { Db };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  multiple_values INTEGER NOT NULL DEFAULT 0,
  followup_prompt TEXT NOT NULL DEFAULT '',
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS entity_values (
  id INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  synonyms TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS intents (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  comment TEXT NOT NULL DEFAULT '',
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS intent_phrases (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS intent_entities (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  required INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  full_answers TEXT NOT NULL DEFAULT '[]',
  short_answers TEXT NOT NULL DEFAULT '[]',
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS dependency_dictionary (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "values" TEXT NOT NULL DEFAULT '[]',
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS scenarios (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS scenario_parts (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS scenario_dependencies (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  ref TEXT NOT NULL,
  entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'string',
  options TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS scenario_entities (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  followup_prompt TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 0,
  is_array INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scenario_states (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  part_id INTEGER REFERENCES scenario_parts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
  system_action TEXT NOT NULL DEFAULT '',
  UNIQUE (part_id, name)
);
CREATE TABLE IF NOT EXISTS scenario_steps (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  part_id INTEGER REFERENCES scenario_parts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'transition',
  state TEXT NOT NULL DEFAULT '',
  intent_id INTEGER REFERENCES intents(id) ON DELETE SET NULL,
  any_intent INTEGER NOT NULL DEFAULT 0,
  request_params TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL DEFAULT '',
  conditions TEXT NOT NULL DEFAULT '[]',
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
  system_action TEXT NOT NULL DEFAULT '',
  next_states TEXT NOT NULL DEFAULT ''
);
`;

export async function openDb(opts: OpenOpts = {}): Promise<Db> {
  const db = await openSqlite(opts);
  db.exec(SCHEMA);
  return db;
}
