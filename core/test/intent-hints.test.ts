import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown) => {
    const result = await app.handle({ method, url, body });
    return { status: result.status, body: result.body as any };
  };
  const pid = (await call('POST', '/api/projects', { name: 'Hints' })).body.id;
  const sid = (await call('POST', `/api/projects/${pid}/scenarios`, { name: 'Scenario' })).body.id;
  const id = (await call('POST', `/api/scenarios/${sid}/intents`, { name: 'INT_TEST' })).body.id;
  return { db, call, pid, sid, id };
}

describe('примеры интентов в выпадающих списках', () => {
  it('возвращает паттерн, если обычных фраз нет, в проекте и в сценарии', async () => {
    const { call, id, pid, sid } = await setup();
    expect((await call('PUT', `/api/intents/${id}`, { name: 'INT_TEST', comment: '  ', patterns: ['* включи детский замок *', '* заблокируй двери *'] })).status).toBe(200);
    for (const url of [`/api/projects/${pid}/intents`, `/api/scenarios/${sid}/intents`]) {
      const list = await call('GET', url);
      expect(list.status).toBe(200);
      expect(list.body[0].hint).toBe('* включи детский замок *');
    }
  });
  it('сохраняет приоритет комментария и обычной фразы; пустой интент остаётся без подписи', async () => {
    const { call, id, pid } = await setup();
    for (const [body, expected] of [
      [{ comment: 'Комментарий', phrases: ['Фраза'], patterns: ['* паттерн *'] }, 'Комментарий'],
      [{ phrases: ['Фраза'], patterns: ['* паттерн *'] }, 'Фраза'],
      [{}, ''],
    ] as const) {
      expect((await call('PUT', `/api/intents/${id}`, { name: 'INT_TEST', ...body })).status).toBe(200);
      expect((await call('GET', `/api/projects/${pid}/intents`)).body[0].hint).toBe(expected);
    }
  });

});
