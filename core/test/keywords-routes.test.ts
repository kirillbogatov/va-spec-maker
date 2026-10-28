import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';
import { dumpProject, importProject } from '../src/project-dump';

describe('keywords dictionary', () => {
  it('создаёт, правит, отклоняет дубли без учёта регистра и удаляет', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const c = await request(app).post(`/api/projects/${pid}/keywords`).send({ name: '$OFF' });
    expect(c.status).toBe(201);
    expect(c.body.name).toBe('OFF');
    const put = await request(app).put(`/api/keywords/${c.body.id}`).send({ name: 'OFF', synonyms: [' выключи ', 'Выключи', '', 'отключи'] });
    expect(put.body).toMatchObject({ name: 'OFF', synonyms: ['выключи', 'отключи'], used_by: [] });
    expect((await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'off' })).status).toBe(409);
    const other = await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'SOUND' });
    expect((await request(app).put(`/api/keywords/${other.body.id}`).send({ name: 'Off', synonyms: [] })).status).toBe(409);
    expect((await request(app).get(`/api/projects/${pid}/keywords`)).body.map((k: { name: string }) => k.name)).toEqual(['OFF', 'SOUND']);
    expect((await request(app).delete(`/api/keywords/${c.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/keywords/${c.body.id}`)).status).toBe(404);
  });

  it('экспортирует и импортирует txt: обновляет существующие, добавляет новые', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const a = await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'OFF' });
    await request(app).put(`/api/keywords/${a.body.id}`).send({ name: 'OFF', synonyms: ['старый'] });
    const r = await request(app).post(`/api/projects/${pid}/keywords/import`).send({ text: 'off: выключи, отключи\nSOUND: звук\n: плохая\n' });
    expect(r.body).toEqual({ added: 1, updated: 1, skipped: 1 });
    const exp = await request(app).get(`/api/projects/${pid}/keywords/export`);
    expect(exp.headers['content-disposition']).toContain("filename*=UTF-8''keywords.txt");
    expect(exp.body).toBe('OFF: выключи, отключи\nSOUND: звук\n');
  });

  it('used_by — сценарии, где концепт во фразах интента или в условии строки', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    await request(app).post(`/api/projects/${pid}/keywords/import`).send({ text: 'OFF: выключи\nSOUND: звук\nTEMP: температура\n' });
    const kw = Object.fromEntries((await request(app).get(`/api/projects/${pid}/keywords`)).body.map((k: { name: string; id: number }) => [k.name, k.id]));
    const a = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Свет' });
    const b = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Климат' });
    const intent = await request(app).post(`/api/scenarios/${a.body.id}/intents`).send({ name: 'INT_OFF' });
    await request(app).put(`/api/intents/${intent.body.id}`).send({ name: 'INT_OFF', phrases: ['выключи свет'], entities: [] });
    const scenario = (await request(app).get(`/api/scenarios/${b.body.id}`)).body;
    const step = { kind: 'transition', state: 'VA_ACTIVATION', intent_id: null, request_params: '', condition: '', conditions: [{ dep: '', keyword_id: kw.SOUND, op: '=', value: '' }], prompt_id: null, system_action: '', next_states: 'ST_DONE' };
    await request(app).put(`/api/scenarios/${b.body.id}`).send({ ...scenario, parts: [{ ...scenario.parts[0], steps: [step] }] });
    const list = (await request(app).get(`/api/projects/${pid}/keywords`)).body as { name: string; used_by: { name: string }[] }[];
    expect(Object.fromEntries(list.map((k) => [k.name, k.used_by.map((s) => s.name)]))).toEqual({ OFF: ['Свет'], SOUND: ['Климат'], TEMP: [] });
    expect((await request(app).get(`/api/keywords/${kw.OFF}`)).body.used_by).toEqual([{ id: a.body.id, name: 'Свет' }]);
  });

  it('входит в дамп и восстановление проекта', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    await request(app).post(`/api/projects/${pid}/keywords/import`).send({ text: 'OFF: выключи\n' });
    const copy = importProject(db, dumpProject(db, pid));
    const list = await request(app).get(`/api/projects/${copy}/keywords`);
    expect(list.body.map((k: { name: string; synonyms: string[] }) => [k.name, k.synonyms])).toEqual([['OFF', ['выключи']]]);
  });
});
