import { describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/db';
import type { Db } from '../src/sqlite';
import { createProject } from './helpers';

const hasColumn = (db: Db, table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);

/** Приводит свежую БД к виду до миграции: старые колонки и user_version = 0. */
function makeLegacy(db: Db) {
  if (!hasColumn(db, 'intents', 'scenario_id')) db.exec('ALTER TABLE intents ADD COLUMN scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE');
  if (!hasColumn(db, 'prompts', 'scenario_id')) db.exec('ALTER TABLE prompts ADD COLUMN scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE');
  if (!hasColumn(db, 'scenario_steps', 'any_intent')) db.exec('ALTER TABLE scenario_steps ADD COLUMN any_intent INTEGER NOT NULL DEFAULT 0');
  db.exec('DELETE FROM scenario_intents; DELETE FROM scenario_prompts; PRAGMA user_version = 0');
}

const userVersion = (db: Db) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const links = (db: Db, table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, number>[];

describe('migrate', () => {
  it('stamps a fresh database with version 5', async () => {
    const db = await openDb();
    expect(userVersion(db)).toBe(5);
  });

  it('turns ownership and usage into connections, and any_intent transitions into errors', async () => {
    const db = await openDb();
    makeLegacy(db);
    const pid = createProject(db);
    const run = (sql: string, ...p: unknown[]) => Number(db.prepare(sql).run(...p).lastInsertRowid);
    const s1 = run('INSERT INTO scenarios(project_id, name) VALUES (?, ?)', pid, 'S1');
    const s2 = run('INSERT INTO scenarios(project_id, name) VALUES (?, ?)', pid, 'S2');
    const own = run('INSERT INTO intents(project_id, name, scenario_id) VALUES (?, ?, ?)', pid, 'INT_OWN', s1);
    const used = run('INSERT INTO intents(project_id, name) VALUES (?, ?)', pid, 'INT_USED');
    const free = run('INSERT INTO intents(project_id, name) VALUES (?, ?)', pid, 'INT_FREE');
    const pOwn = run('INSERT INTO prompts(project_id, name, scenario_id) VALUES (?, ?, ?)', pid, 'PRM_OWN', s1);
    const pState = run('INSERT INTO prompts(project_id, name) VALUES (?, ?)', pid, 'PRM_STATE');
    run('INSERT INTO scenario_steps(scenario_id, kind, state, intent_id) VALUES (?, ?, ?, ?)', s2, 'transition', 'A', used);
    run('INSERT INTO scenario_steps(scenario_id, kind, state, any_intent) VALUES (?, ?, ?, 1)', s1, 'transition', 'B');
    run('INSERT INTO scenario_states(scenario_id, name, prompt_id) VALUES (?, ?, ?)', s2, 'ST', pState);

    migrate(db);

    expect(links(db, 'scenario_intents').map((l) => [l.scenario_id, l.intent_id, l.is_global])).toEqual([[s1, own, 0], [s2, used, 0]]);
    expect(links(db, 'scenario_prompts').map((l) => [l.scenario_id, l.prompt_id])).toEqual([[s1, pOwn], [s2, pState]]);
    expect(db.prepare('SELECT scenario_id FROM intents WHERE scenario_id IS NOT NULL').all()).toEqual([]);
    expect(db.prepare('SELECT scenario_id FROM prompts WHERE scenario_id IS NOT NULL').all()).toEqual([]);
    expect(db.prepare("SELECT kind FROM scenario_steps WHERE state = 'B'").get()).toEqual({ kind: 'error' });
    expect(db.prepare('SELECT 1 FROM scenario_intents WHERE intent_id = ?').get(free)).toBeUndefined();
    expect(userVersion(db)).toBe(5);
  });

  it('adds entity type columns to an older database and keeps existing entities as strings', async () => {
    const db = await openDb();
    for (const col of ['type', 'range_min', 'range_max']) db.exec(`ALTER TABLE entities DROP COLUMN ${col}`);
    db.exec('PRAGMA user_version = 1');
    const pid = createProject(db);
    db.prepare('INSERT INTO entities(project_id, name) VALUES (?, ?)').run(pid, 'ROOM');

    migrate(db);

    expect(db.prepare('SELECT type, range_min, range_max FROM entities').get()).toEqual({ type: 'string', range_min: '', range_max: '' });
    expect(userVersion(db)).toBe(5);
    migrate(db);
    expect(userVersion(db)).toBe(5);
  });

  it('is idempotent and leaves intents alive when their scenario is deleted', async () => {
    const db = await openDb();
    makeLegacy(db);
    const pid = createProject(db);
    const s1 = Number(db.prepare('INSERT INTO scenarios(project_id, name) VALUES (?, ?)').run(pid, 'S1').lastInsertRowid);
    db.prepare('INSERT INTO intents(project_id, name, scenario_id) VALUES (?, ?, ?)').run(pid, 'INT_OWN', s1);
    migrate(db);
    const before = links(db, 'scenario_intents');
    db.exec('PRAGMA user_version = 0');
    migrate(db);
    expect(links(db, 'scenario_intents')).toEqual(before);
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(s1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM intents').get()).toEqual({ n: 1 });
  });
});
