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
  type TEXT NOT NULL DEFAULT 'string',
  range_min TEXT NOT NULL DEFAULT '',
  range_max TEXT NOT NULL DEFAULT '',
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
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS intent_phrases (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS intent_patterns (
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
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS dependency_dictionary (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "values" TEXT NOT NULL DEFAULT '[]',
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  synonyms TEXT NOT NULL DEFAULT '[]',
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
CREATE TABLE IF NOT EXISTS scenario_intents (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  is_global INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (scenario_id, intent_id)
);
CREATE TABLE IF NOT EXISTS scenario_prompts (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (scenario_id, prompt_id)
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
  name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'transition',
  state TEXT NOT NULL DEFAULT '',
  intent_id INTEGER REFERENCES intents(id) ON DELETE SET NULL,
  request_params TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL DEFAULT '',
  conditions TEXT NOT NULL DEFAULT '[]',
  cond_mode TEXT NOT NULL DEFAULT 'all',
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
  system_action TEXT NOT NULL DEFAULT '',
  next_states TEXT NOT NULL DEFAULT ''
);
`;

const hasColumn = (db: Db, table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);

/**
 * Версия 1: интенты и промпты подключаются к сценариям связями, а не принадлежат им.
 * Старые колонки не удаляются (SQLite не умеет без пересоздания таблицы, а оно каскадно сотрёт связанные строки),
 * но обнуляются, чтобы удаление сценария не уносило интенты.
 * Версия 2: тип и диапазон сущностей.
 */
export function migrate(db: Db): void {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version < 1) {
    db.transaction(() => {
      for (const [table, link, col] of [['intents', 'scenario_intents', 'intent_id'], ['prompts', 'scenario_prompts', 'prompt_id']] as const) {
        if (!hasColumn(db, table, 'scenario_id')) continue;
        db.exec(`INSERT OR IGNORE INTO ${link}(scenario_id, ${col}) SELECT scenario_id, id FROM ${table} WHERE scenario_id IS NOT NULL ORDER BY id;
                 UPDATE ${table} SET scenario_id = NULL;`);
      }
      if (hasColumn(db, 'scenario_steps', 'any_intent')) {
        db.exec(`UPDATE scenario_steps SET kind = 'error', intent_id = NULL WHERE any_intent = 1;
                 UPDATE scenario_steps SET any_intent = 0;`);
      }
      db.exec(`INSERT OR IGNORE INTO scenario_intents(scenario_id, intent_id)
                 SELECT DISTINCT scenario_id, intent_id FROM scenario_steps WHERE intent_id IS NOT NULL ORDER BY scenario_id, intent_id;
               INSERT OR IGNORE INTO scenario_prompts(scenario_id, prompt_id)
                 SELECT scenario_id, prompt_id FROM scenario_steps WHERE prompt_id IS NOT NULL
                 UNION SELECT scenario_id, prompt_id FROM scenario_states WHERE prompt_id IS NOT NULL;`);
    })();
    db.exec('PRAGMA user_version = 1');
  }
  if (user_version < 2) {
    // Версия 2: у сущностей появились тип и диапазон. Существующие становятся строками.
    for (const ddl of ["type TEXT NOT NULL DEFAULT 'string'", "range_min TEXT NOT NULL DEFAULT ''", "range_max TEXT NOT NULL DEFAULT ''"]) {
      if (!hasColumn(db, 'entities', ddl.split(' ')[0])) db.exec(`ALTER TABLE entities ADD COLUMN ${ddl}`);
    }
    db.exec('PRAGMA user_version = 2');
  }
  if (user_version < 3) {
    // Версия 3: условия строки можно объединять не только по «И», но и по «ИЛИ».
    if (!hasColumn(db, 'scenario_steps', 'cond_mode')) db.exec("ALTER TABLE scenario_steps ADD COLUMN cond_mode TEXT NOT NULL DEFAULT 'all'");
    db.exec('PRAGMA user_version = 3');
  }
  if (user_version < 4) {
    // Версия 4: у правил (ошибок и глобальных переходов) появилось название.
    if (!hasColumn(db, 'scenario_steps', 'name')) db.exec("ALTER TABLE scenario_steps ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    db.exec('PRAGMA user_version = 4');
  }
}

export async function openDb(opts: OpenOpts = {}): Promise<Db> {
  const db = await openSqlite(opts);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
