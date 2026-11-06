import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { loadProjectSpec } from '../src/export/model';
import { promptsTable } from '../src/export/tables';
import { importScenario } from '../src/scenario-import';
import type { ProjectDump } from '../src/project-dump';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown) => {
    const r = await app.handle({ method, url: '/api' + url, body });
    return r;
  };
  const pid = ((await call('POST', '/projects', { name: 'P' })).body as any).id;
  return { db, call, pid };
}

describe('project prompt answer mode', () => {
  it('defaults to unified answers and preserves an explicitly enabled preference on reopen', async () => {
    const { call, db, pid } = await setup();
    expect((await call('GET', `/projects/${pid}/prompt-settings`)).body).toEqual({ splitAnswers: false });
    await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: true });
    const reopened = await openDb({ data: db.serialize() });
    expect(loadProjectSpec(reopened, pid).splitPromptAnswers).toBe(true);
    reopened.close();
  });
  it('merges every variant in prompts and templates, survives repeated toggles and preserves other projects', async () => {
    const { call, pid } = await setup();
    const other = ((await call('POST', '/projects', { name: 'Other' })).body as any).id;
    await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: true });
    await call('PUT', `/projects/${other}/prompt-settings`, { splitAnswers: true });
    const create = async (project: number, resource: string, name: string) => ((await call('POST', `/projects/${project}/${resource}`, { name, full_answers: ['Full', 'Same'], short_answers: ['Short', 'Same'] })).body as any).id;
    const prompt = await create(pid, 'prompts', 'P1');
    const template = await create(pid, 'response-templates', 'T1');
    const otherPrompt = await create(other, 'prompts', 'P2');
    expect((await call('GET', `/projects/${pid}/prompt-settings`)).body).toEqual({ splitAnswers: true });
    for (let i = 0; i < 3; i++) {
      expect((await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: false })).status).toBe(200);
      for (const path of [`/prompts/${prompt}`, `/response-templates/${template}`]) {
        expect((await call('GET', path)).body).toMatchObject({ full_answers: ['Full', 'Same', 'Short', 'Same'], short_answers: [] });
      }
      await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: true });
      expect((await call('GET', `/prompts/${prompt}`)).body).toMatchObject({ full_answers: ['Full', 'Same', 'Short', 'Same'], short_answers: [] });
    }
    expect((await call('GET', `/prompts/${otherPrompt}`)).body).toMatchObject({ full_answers: ['Full', 'Same'], short_answers: ['Short', 'Same'] });
  });

  it('normalizes writes and copies while unified, persists the mode in dumps and exports one answer column', async () => {
    const { call, db, pid } = await setup();
    await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: false });
    const template = ((await call('POST', `/projects/${pid}/response-templates`, { name: 'T', full_answers: ['A'], short_answers: ['B'] })).body as any).id;
    expect((await call('GET', `/response-templates/${template}`)).body).toMatchObject({ full_answers: ['A', 'B'], short_answers: [] });
    const prompt = ((await call('POST', `/projects/${pid}/prompts`, { name: 'P', template_id: template })).body as any).id;
    expect((await call('GET', `/prompts/${prompt}`)).body).toMatchObject({ full_answers: ['A', 'B'], short_answers: [] });
    await call('PUT', `/prompts/${prompt}`, { name: 'P', full_answers: ['C'], short_answers: ['D'] });
    await call('PUT', `/response-templates/${template}`, { name: 'T', full_answers: ['E'], short_answers: ['F'] });
    expect((await call('GET', `/prompts/${prompt}`)).body).toMatchObject({ full_answers: ['C', 'D'], short_answers: [] });
    expect((await call('GET', `/response-templates/${template}`)).body).toMatchObject({ full_answers: ['E', 'F'], short_answers: [] });
    const table = promptsTable(loadProjectSpec(db, pid));
    expect(table.head).toEqual(['Промпт', 'Ответ ассистента']);
    expect(table.rows[0].cells).toHaveLength(2);
    const reopened = await openDb({ data: db.serialize() });
    expect(loadProjectSpec(reopened, pid).splitPromptAnswers).toBe(false);
    reopened.close();
    const dump = (await call('GET', `/projects/${pid}/dump`)).body;
    const copy = ((await call('POST', '/projects/import', dump)).body as any).id;
    expect((await call('GET', `/projects/${copy}/prompt-settings`)).body).toEqual({ splitAnswers: false });
    const duplicate = ((await call('POST', `/projects/${pid}/duplicate`)).body as any).id;
    expect((await call('GET', `/projects/${duplicate}/prompt-settings`)).body).toEqual({ splitAnswers: false });
    expect(await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: true })).toMatchObject({ status: 200, body: { splitAnswers: true } });
    expect((await call('GET', `/projects/${pid}/prompt-settings`)).body).toEqual({ splitAnswers: true });
    expect(db.prepare('SELECT * FROM prompt_settings WHERE project_id = ?').get(pid).split_answers).toBe(1);
    expect(loadProjectSpec(db, pid).splitPromptAnswers).toBe(true);
    expect(promptsTable(loadProjectSpec(db, pid)).head).toEqual(['Промпт', 'Полный ответ', 'Короткий ответ']);
  });

  it('imports scenarios using the destination answer mode and migrates old databases', async () => {
    const { call, db, pid } = await setup();
    await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: true });
    const sid = ((await call('POST', `/projects/${pid}/scenarios`, { name: 'S' })).body as any).id;
    await call('POST', `/scenarios/${sid}/prompts`, { name: 'P', full_answers: ['Full'], short_answers: ['Short'] });
    // Ensure the source dump includes an explicitly saved split setting.
    await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: true });
    const dump = (await call('GET', `/projects/${pid}/dump`)).body as ProjectDump;
    const target = ((await call('POST', '/projects', { name: 'Target' })).body as any).id;
    await call('PUT', `/projects/${target}/prompt-settings`, { splitAnswers: false });
    importScenario(db, target, dump, sid);
    expect((await call('GET', `/projects/${target}/prompt-settings`)).body).toEqual({ splitAnswers: false });
    expect(db.prepare('SELECT full_answers, short_answers FROM prompts WHERE project_id = ?').get(target)).toEqual({ full_answers: '["Full","Short"]', short_answers: '[]' });
    db.exec('DROP TABLE prompt_settings');
    const upgraded = await openDb({ data: db.serialize() });
    expect(loadProjectSpec(upgraded, pid).splitPromptAnswers).toBe(false);
    expect(upgraded.prepare('SELECT full_answers, short_answers FROM prompts WHERE project_id = ?').get(pid)).toEqual({ full_answers: '["Full","Short"]', short_answers: '[]' });
    upgraded.close();
  });

  it('rejects invalid settings and missing projects without modifying answers', async () => {
    const { call, pid } = await setup();
    expect((await call('PUT', `/projects/${pid}/prompt-settings`, { splitAnswers: 'false' })).status).toBe(400);
    expect((await call('PUT', '/projects/999/prompt-settings', { splitAnswers: false })).status).toBe(404);
    expect((await call('GET', `/projects/${pid}/prompt-settings`)).body).toEqual({ splitAnswers: false });
  });
});
