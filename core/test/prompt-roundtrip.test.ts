import { expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { existsSync } from 'node:fs';

const otherDbUrl = new URL('../../../VA Spec Maker — ATOM/core/src/db.ts', import.meta.url);
const otherAppUrl = new URL('../../../VA Spec Maker — ATOM/core/src/app.ts', import.meta.url);

it.skipIf(!existsSync(otherDbUrl))('creates, loads and edits prompts across repeated switches between both editions without internal errors', async () => {
  const { openDb: openOther } = await import(/* @vite-ignore */ otherDbUrl.href) as { openDb: typeof openDb };
  const { createApp: otherApp } = await import(/* @vite-ignore */ otherAppUrl.href) as { createApp: typeof createApp };
  const errors = vi.spyOn(console, 'error');
  try {
    let db = await openOther();
    db.prepare("INSERT INTO projects(name) VALUES ('P')").run();
    db.prepare("INSERT INTO scenarios(project_id, name) VALUES (1, 'S')").run();
    db.prepare("INSERT INTO scenario_parts(scenario_id, name) VALUES (1, 'Part')").run();
    for (let pass = 0; pass < 4; pass++) {
      db = await (pass % 2 === 0 ? openDb : openOther)({ data: db.serialize() });
      const app = (pass % 2 === 0 ? createApp : otherApp)(db);
      const call = (method: string, url: string, body?: unknown) => app.handle({ method, url, body });
      const created = await call('POST', '/api/scenarios/1/prompts', { name: `PRM_${pass}` });
      expect(created.status).toBe(201);
      const id = (created.body as { id: number }).id;
      const urls = ['/api/scenarios/1', '/api/projects/1/prompts', '/api/scenarios/1/prompts', `/api/prompts/${id}`, '/api/scenarios/1/history', '/api/scenarios/1/changelog', '/api/projects/1/dependency-dictionary'];
      for (const url of urls) expect((await call('GET', url)).status, url).toBe(200);
      expect((await call('PUT', `/api/prompts/${id}`, { name: `PRM_EDITED_${pass}`, full_answers: ['Ответ'], short_answers: ['Краткий'] })).status).toBe(200);
      for (const url of urls) expect((await call('GET', url)).status, url).toBe(200);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }
    expect(db.prepare('SELECT id FROM prompts').all()).toHaveLength(4);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
  }
});
