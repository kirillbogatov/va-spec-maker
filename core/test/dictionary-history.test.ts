import { expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { dumpProject, importProject } from '../src/project-dump';

async function setup() {
  const db = await openDb();
  db.exec("INSERT INTO projects(id, name) VALUES (1, 'P'), (2, 'Other')");
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown, status = 200) => {
    const result = await app.handle({ method, url, body });
    expect(result.status, JSON.stringify(result.body)).toBe(status);
    return result.body as any;
  };
  const history = (kind: string, pid = 1) => call('GET', `/projects/${pid}/dictionaries/${kind}/history`);
  return { db, call, history };
}

it('records creation, field changes, deletion and project isolation for every directory', async () => {
  const { db, call, history } = await setup();
  const kinds = ['intents', 'entities', 'prompts', 'dependencies', 'response-templates', 'keywords'];
  for (const kind of kinds) {
    const endpoint = kind === 'dependencies' ? 'dependency-dictionary' : kind;
    const created = await call('POST', `/projects/1/${endpoint}`, { name: 'FIRST' }, 201);
    expect(await history(kind)).toMatchObject([{ item_name: 'FIRST', description: 'Элемент создан' }]);
    const current = await call('GET', `/${endpoint}/${created.id}`);
    const next = { ...current, name: 'RENAMED', description: 'New description', synonyms: ['hello'], comment: 'Updated' };
    await call('PUT', `/${endpoint}/${created.id}`, next);
    const entries = await history(kind);
    expect(entries[0]).toMatchObject({ item_name: 'RENAMED' });
    expect(entries[0].description).toContain('Название: FIRST → RENAMED');
    expect(Number.isNaN(Date.parse(entries[0].at))).toBe(false);
    await call('PUT', `/${endpoint}/${created.id}`, next);
    expect(await history(kind)).toHaveLength(2);
    await call('DELETE', `/${endpoint}/${created.id}`, undefined, 204);
    expect(await history(kind)).toHaveLength(3);
    expect((await history(kind))[0]).toMatchObject({ item_name: 'RENAMED', description: 'Элемент удалён' });
    expect(await history(kind, 2)).toEqual([]);
  }
  await call('GET', '/projects/999/dictionaries/intents/history', undefined, 404);
  await call('GET', '/projects/1/dictionaries/unknown/history', undefined, 400);
  db.close();
});

it('compares nested content instead of regenerated row IDs and rolls back failures', async () => {
  const { db, call, history } = await setup();
  const entity = await call('POST', '/projects/1/entities', { name: 'ENTITY' }, 201);
  const value = { name: 'ENTITY', description: '', type: 'string', multiple_values: false, values: [{ value: 'one', synonyms: ['first'] }] };
  await call('PUT', `/entities/${entity.id}`, value);
  expect((await history('entities'))[0].description).toContain('one');
  await call('PUT', `/entities/${entity.id}`, value);
  expect(await history('entities')).toHaveLength(2);
  const intent = await call('POST', '/projects/1/intents', { name: 'INTENT' }, 201);
  const payload = { name: 'INTENT', enabled: true, comment: '', phrases: ['hello'], patterns: [], entities: [{ entity_id: entity.id, required: true }] };
  await call('PUT', `/intents/${intent.id}`, payload);
  expect((await history('intents'))[0].description).toContain('Фразы:');
  expect((await history('intents'))[0].description).toContain('Сущности:');
  await call('PUT', `/intents/${intent.id}`, payload);
  expect(await history('intents')).toHaveLength(2);
  await call('POST', '/projects/1/intents', { name: 'INTENT' }, 409);
  expect(await history('intents')).toHaveLength(2);
  await call('PUT', `/intents/${intent.id}`, { ...payload, name: 'INVALID', entities: [{ entity_id: 99999 }] }, 400);
  expect((await call('GET', `/intents/${intent.id}`)).name).toBe('INTENT');
  expect(await history('intents')).toHaveLength(2);
  db.close();
});

it('retains history through persisted databases and project backups, including deleted names', async () => {
  const { db, call, history } = await setup();
  const p = await call('POST', '/projects/1/prompts', { name: 'DELETED' }, 201);
  await call('DELETE', `/prompts/${p.id}`, undefined, 204);
  const expected = await history('prompts');
  const restored = await openDb({ data: db.serialize() });
  expect(restored.prepare('SELECT item_name, description FROM dictionary_history ORDER BY id DESC').all()).toEqual(expected.map((e: any) => ({ item_name: e.item_name, description: e.description })));
  const copy = importProject(restored, dumpProject(db, 1));
  expect(restored.prepare('SELECT item_name, description FROM dictionary_history WHERE project_id = ? ORDER BY id DESC').all(copy)).toEqual(expected.map((e: any) => ({ item_name: e.item_name, description: e.description })));
  const app = createApp(restored);
  expect((await app.handle({ method: 'DELETE', url: `/projects/${copy}` })).status).toBe(204);
  expect(restored.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  restored.close(); db.close();
});


it('captures synonym changes made by directory imports without duplicate no-op entries', async () => {
  const { db, call, history } = await setup();
  const kind = 'keywords';
  await call('POST', `/projects/1/${kind}/import`, { text: 'READY: ready', mode: 'merge' });
  expect(await history(kind)).toHaveLength(1);
  await call('POST', `/projects/1/${kind}/import`, { text: 'READY: ready', mode: 'merge' });
  expect(await history(kind)).toHaveLength(1);
  await call('POST', `/projects/1/${kind}/import`, { text: 'READY: updated', mode: 'replace' });
  expect((await history(kind))[0].description).toContain('Синонимы: ready → updated');
  await call('POST', `/projects/1/${kind}/import`, { text: 'OTHER: other', mode: 'replace' });
  expect(await history(kind)).toHaveLength(3);
  expect((await history(kind))[0]).toMatchObject({ item_name: 'OTHER', description: 'Элемент создан' });
  db.close();
});
