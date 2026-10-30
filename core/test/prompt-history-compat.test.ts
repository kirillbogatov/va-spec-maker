import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

it('creates and connects a prompt after opening a database from the other version', async () => {
  const old = await openDb();
  old.exec(`DROP TABLE scenario_history;
    CREATE TABLE scenario_history (id INTEGER PRIMARY KEY, scenario_id INTEGER NOT NULL REFERENCES scenarios(id), at TEXT NOT NULL, field TEXT NOT NULL DEFAULT '', old_value TEXT NOT NULL DEFAULT '', new_value TEXT NOT NULL DEFAULT '', text TEXT NOT NULL)`);
  old.prepare('INSERT INTO projects(name) VALUES (?)').run('P');
  old.prepare('INSERT INTO scenarios(project_id, name) VALUES (1, ?)').run('S');
  old.exec("INSERT INTO scenario_history(scenario_id, at, text) VALUES (1, '2026-10-30T10:00:00.000Z', 'Existing event')");
  const db = await openDb({ data: old.serialize() });
  expect(db.prepare('SELECT text FROM scenario_history').all()).toEqual([{ text: 'Existing event' }]);
  const app = createApp(db);
  const result = await app.handle({ method: 'POST', url: '/api/scenarios/1/prompts', body: { name: 'PRM_TEST' } });
  expect(result.status).toBe(201);
  expect(db.prepare('SELECT name FROM prompts').all()).toEqual([{ name: 'PRM_TEST' }]);
  expect(db.prepare('SELECT prompt_id FROM scenario_prompts').all()).toHaveLength(1);
  const reopened = await openDb({ data: db.serialize() });
  expect(reopened.prepare("SELECT text FROM scenario_history WHERE text = 'Existing event'").all()).toHaveLength(1);
  expect((await app.handle({ method: 'GET', url: '/api/scenarios/1/history' })).status).toBe(200);
});
