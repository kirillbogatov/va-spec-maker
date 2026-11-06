import { expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { dumpProject, importProject } from '../src/project-dump';
import { loadProjectSpec, loadScenarioDoc } from '../src/export/model';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown, status = 200) => {
    const r = await app.handle({ method, url, body });
    expect(r.status, JSON.stringify(r.body)).toBe(status);
    return r.body as any;
  };
  const project = await call('POST', '/projects', { name: 'Isolation' }, 201);
  return { db, call, pid: project.id as number };
}

it('keeps template contents out of regular lists, counts, history and project exports, then materializes regular copies', async () => {
  const { db, call, pid } = await setup();
  const source = await call('POST', `/projects/${pid}/scenarios`, { name: 'Source' }, 201);
  const original = await call('POST', `/scenarios/${source.id}/intents`, { name: 'INT_ORIGINAL' }, 201);
  await call('POST', `/scenarios/${source.id}/prompts`, { name: 'PRM_ORIGINAL' }, 201);
  const template = await call('POST', `/projects/${pid}/scenario-templates`, { name: 'TEMP_SCENARIO', source_id: source.id }, 201);
  const privateIntent = await call('POST', `/scenarios/${template.id}/intents`, { name: 'INT_PRIVATE' }, 201);
  const privatePrompt = await call('POST', `/scenarios/${template.id}/prompts`, { name: 'PRM_PRIVATE' }, 201);
  for (const kind of ['intents', 'prompts']) {
    expect((await call('GET', `/projects/${pid}/${kind}`)).map((row: any) => row.name)).toEqual([kind === 'intents' ? 'INT_ORIGINAL' : 'PRM_ORIGINAL']);
    expect((await call('GET', `/scenarios/${template.id}/${kind}`))).toHaveLength(2);
    expect((await call('GET', `/projects/${pid}/dictionaries/${kind}/history`)).every((e: any) => !e.item_name.includes('PRIVATE') && !e.item_name.includes('TEMP_SCENARIO'))).toBe(true);
  }
  expect(await call('GET', '/projects')).toMatchObject([{ scenario_count: 1, intent_count: 1, prompt_count: 1 }]);
  expect((await call('GET', `/projects/${pid}/scenarios`)).map((s: any) => s.id)).toEqual([source.id]);
  expect(loadProjectSpec(db, pid).intents.map(i => i.name)).toEqual(['INT_ORIGINAL']);
  expect(loadProjectSpec(db, pid).prompts.map(p => p.name)).toEqual(['PRM_ORIGINAL']);
  expect(loadScenarioDoc(db, template.id).spec.intents).toHaveLength(2);
  await call('PUT', `/scenarios/${source.id}/intents/${privateIntent.id}`, {}, 404);
  await call('PUT', `/scenarios/${source.id}/prompts/${privatePrompt.id}`, {}, 404);
  // Ordinary project entries can still be shared with a template without becoming private.
  await call('PUT', `/scenarios/${template.id}/intents/${original.id}`, {});
  expect((await call('GET', `/projects/${pid}/intents`)).map((i: any) => i.id)).toEqual([original.id]);
  const copy = await call('POST', `/projects/${pid}/scenarios`, { name: 'Real', template_id: template.id }, 201);
  const copies = await call('GET', `/scenarios/${copy.id}/intents`);
  const allIds = new Set((await call('GET', `/projects/${pid}/intents`)).map((i: any) => i.id));
  expect(copies.every((i: any) => allIds.has(i.id))).toBe(true);
  expect(copies.some((i: any) => i.id === privateIntent.id)).toBe(false);
  const copyPrompts = await call('GET', `/scenarios/${copy.id}/prompts`);
  expect((await call('GET', `/projects/${pid}/prompts`)).map((p: any) => p.id)).toEqual(expect.arrayContaining(copyPrompts.map((p: any) => p.id)));
  await call('DELETE', `/scenarios/${template.id}/intents/${privateIntent.id}`, undefined, 204);
  await call('DELETE', `/scenarios/${template.id}`, undefined, 204);
  expect((await call('GET', `/projects/${pid}/intents`)).some((i: any) => i.id === privateIntent.id)).toBe(false);
  expect((await call('GET', `/projects/${pid}/prompts`)).some((p: any) => p.id === privatePrompt.id)).toBe(false);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  db.close();
});

it('backfills older databases and imports while preserving shared objects and ownership in new backups', async () => {
  const { db, call, pid } = await setup();
  const normal = await call('POST', `/projects/${pid}/scenarios`, { name: 'Normal' }, 201);
  const template = await call('POST', `/projects/${pid}/scenario-templates`, { name: 'Template' }, 201);
  const privateIntent = await call('POST', `/scenarios/${template.id}/intents`, { name: 'INT_PRIVATE' }, 201);
  await call('POST', `/scenarios/${template.id}/prompts`, { name: 'PRM_PRIVATE' }, 201);
  const shared = await call('POST', `/scenarios/${normal.id}/intents`, { name: 'INT_SHARED' }, 201);
  await call('PUT', `/scenarios/${template.id}/intents/${shared.id}`, {});
  const modernDump = dumpProject(db, pid);
  const modernId = importProject(db, modernDump);
  expect(db.prepare('SELECT name FROM intents WHERE project_id = ? AND is_template = 0').all(modernId)).toEqual([{ name: 'INT_SHARED' }]);
  const legacyDump = structuredClone(modernDump);
  for (const kind of ['intents', 'prompts']) for (const row of legacyDump.tables[kind]) delete row.is_template;
  const legacyId = importProject(db, legacyDump);
  expect(db.prepare('SELECT name FROM intents WHERE project_id = ? AND is_template = 1').all(legacyId)).toEqual([{ name: 'INT_PRIVATE' }]);
  expect(db.prepare('SELECT name FROM intents WHERE project_id = ? AND is_template = 0').all(legacyId)).toEqual([{ name: 'INT_SHARED' }]);
  db.exec('ALTER TABLE intents DROP COLUMN is_template; ALTER TABLE prompts DROP COLUMN is_template');
  const restored = await openDb({ data: db.serialize() });
  expect(restored.prepare('SELECT is_template FROM intents WHERE id = ?').get(privateIntent.id)).toEqual({ is_template: 1 });
  expect(restored.prepare('SELECT is_template FROM intents WHERE id = ?').get(shared.id)).toEqual({ is_template: 0 });
  expect(restored.prepare('SELECT name FROM prompts WHERE project_id = ? AND is_template = 1').all(pid)).toEqual([{ name: 'PRM_PRIVATE' }]);
  restored.close(); db.close();
});
