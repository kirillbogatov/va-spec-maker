import { expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';

it('создаёт и подключает глобальные интенты по умолчанию, сохраняет явный локальный режим', async () => {
  const app = createApp(await openDb());
  const call = async (method: string, url: string, body?: unknown) => {
    const result = await app.handle({ method, url, body });
    expect(result.status).toBeLessThan(400);
    return result.body as any;
  };
  const { id: pid } = await call('POST', '/api/projects', { name: 'P' });
  const { id: sid } = await call('POST', `/api/projects/${pid}/scenarios`, { name: 'S' });
  const created = await call('POST', `/api/scenarios/${sid}/intents`, { name: 'INT_CREATED' });
  const linked = await call('POST', `/api/projects/${pid}/intents`, { name: 'INT_LINKED' });
  await call('PUT', `/api/scenarios/${sid}/intents/${linked.id}`, {});
  expect((await call('GET', `/api/scenarios/${sid}/intents`)).map((row: any) => row.is_global)).toEqual([true, true]);
  await call('PUT', `/api/scenarios/${sid}/intents/${created.id}`, { is_global: false });
  await call('PUT', `/api/scenarios/${sid}/intents/${created.id}`, {});
  const local = await call('POST', `/api/scenarios/${sid}/intents`, { name: 'INT_LOCAL', is_global: false });
  const rows = await call('GET', `/api/scenarios/${sid}/intents`);
  expect(rows.find((row: any) => row.id === created.id).is_global).toBe(false);
  expect(rows.find((row: any) => row.id === local.id).is_global).toBe(false);
});
