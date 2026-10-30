import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

describe('prompt creation with a saved database', () => {
  it('initializes answers explicitly when the saved schema has no defaults', async () => {
    const db = await openDb();
    // Older saved schemas can require answers without providing SQL defaults.
    db.exec(`DROP TABLE prompts;
      CREATE TABLE prompts (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        name TEXT NOT NULL,
        full_answers TEXT NOT NULL
      )`);
    const app = createApp(db);
    const call = (method: string, url: string, body?: unknown) => app.handle({ method, url, body });
    const pid = ((await call('POST', '/api/projects', { name: 'P' })).body as { id: number }).id;
    const sid = ((await call('POST', `/api/projects/${pid}/scenarios`, { name: 'S' })).body as { id: number }).id;
    for (const url of [`/api/projects/${pid}/prompts`, `/api/scenarios/${sid}/prompts`]) {
      const result = await call('POST', url, { name: url });
      expect(result.status).toBe(201);
      const id = (result.body as { id: number }).id;
      expect((await call('GET', `/api/prompts/${id}`)).body).toMatchObject({ full_answers: [] });
    }
    expect((await call('GET', `/api/scenarios/${sid}/prompts`)).body).toHaveLength(1);
  });
});
