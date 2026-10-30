import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

it('loads scenario data and saves a prompt with a high-version database from the other edition', async () => {
  const old = await openDb();
  old.exec("ALTER TABLE dependency_dictionary DROP COLUMN description; PRAGMA user_version = 10");
  const db = await openDb({ data: old.serialize() });
  db.prepare("INSERT INTO projects(name) VALUES ('P')").run();
  db.prepare("INSERT INTO scenarios(project_id, name) VALUES (1, 'S')").run();
  db.prepare("INSERT INTO scenario_parts(scenario_id, name) VALUES (1, 'Part')").run();
  const app = createApp(db);
  const call = (method: string, url: string, body?: unknown) => app.handle({ method, url, body });
  const created = await call('POST', '/api/scenarios/1/prompts', { name: 'PRM_TEST' });
  expect(created.status).toBe(201);
  const id = (created.body as { id: number }).id;
  for (const url of ['/api/scenarios/1', '/api/projects/1/prompts', '/api/scenarios/1/prompts', `/api/prompts/${id}`, '/api/scenarios/1/history', '/api/projects/1/dependency-dictionary']) {
    expect((await call('GET', url)).status, url).toBe(200);
  }
  expect((await call('PUT', `/api/prompts/${id}`, { name: 'PRM_UPDATED', full_answers: ['Ответ'], short_answers: [] })).status).toBe(200);
});
