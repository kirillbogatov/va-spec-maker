import { describe, expect, it } from 'vitest';
import { request } from './request';
import { makeApp } from './helpers';
import { seedDemo } from '../src/demo';

const mk = async (app: any, name: string) => (await request(app).post('/api/projects').send({ name })).body.id as number;

describe('projects API', () => {
  it('creates, lists, renames and deletes projects', async () => {
    const { app } = await makeApp();
    const a = await mk(app, 'Альфа');
    await mk(app, 'Бета');
    expect((await request(app).get('/api/projects')).body).toHaveLength(2);
    expect((await request(app).patch(`/api/projects/${a}`).send({ name: 'Альфа 2' })).body.name).toBe('Альфа 2');
    expect((await request(app).delete(`/api/projects/${a}`)).status).toBe(204);
    expect((await request(app).get('/api/projects')).body).toHaveLength(1);
    expect((await request(app).patch(`/api/projects/${a}`).send({ name: 'X' })).status).toBe(404);
  });

  it('rejects an empty name', async () => {
    const { app } = await makeApp();
    expect((await request(app).post('/api/projects').send({ name: ' ' })).status).toBe(400);
  });

  it('keeps data of different projects separate', async () => {
    const { app } = await makeApp();
    const a = await mk(app, 'A');
    const b = await mk(app, 'B');
    await request(app).post(`/api/projects/${a}/entities`).send({ name: 'ROOM' });
    expect((await request(app).get(`/api/projects/${a}/entities`)).body).toHaveLength(1);
    expect((await request(app).get(`/api/projects/${b}/entities`)).body).toHaveLength(0);
  });
  it('counts a scenario as ready from its connected intents and prompts', async () => {
    const { app } = await makeApp();
    const pid = await mk(app, 'P');
    const ready = async () => (await request(app).get('/api/projects')).body[0].ready_count as number;
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
    const intent = (await request(app).post(`/api/scenarios/${sid}/intents`).send({ name: 'INT_A' })).body.id as number;
    const prompt = (await request(app).post(`/api/scenarios/${sid}/prompts`).send({ name: 'PRM_A' })).body.id as number;
    await request(app).put(`/api/scenarios/${sid}`).send({
      name: 'S', description: 'Описание', parts: [{ steps: [{ kind: 'transition', state: 'A', intent_id: intent, next_states: 'B' }] }],
    });
    expect(await ready()).toBe(0); // у интента нет фраз, у промпта нет ответа
    await request(app).put(`/api/intents/${intent}`).send({ name: 'INT_A', phrases: ['привет'] });
    expect(await ready()).toBe(0);
    await request(app).put(`/api/prompts/${prompt}`).send({ name: 'PRM_A', full_answers: ['Готово'] });
    expect(await ready()).toBe(1);
  });
});

describe('project duplicate / import', () => {
  it('duplicates a project with content and keeps references consistent', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    expect((await request(app).get(`/api/projects/${src}/keywords`)).body).toHaveLength(12);
    const dup = (await request(app).post(`/api/projects/${src}/duplicate`)).body;
    expect(dup.name).toMatch(/\(копия\)$/);
    const sc = (id: number) => request(app).get(`/api/projects/${id}/scenarios`);
    const [a, b] = [(await sc(src)).body, (await sc(dup.id)).body];
    expect(b).toHaveLength(a.length);
    const full = (await request(app).get(`/api/scenarios/${b[0].id}`)).body;
    expect(full.project_id).toBe(dup.id);
    expect(full.parts[0].steps).toHaveLength(7);
    const connected = (await request(app).get(`/api/scenarios/${b[0].id}/intents`)).body as any[];
    expect(connected.find((i) => i.name === 'INT_STOP')).toMatchObject({ is_global: true });
    expect((await request(app).get(`/api/projects/${dup.id}/intents`)).body.length).toBeGreaterThan(0);
    await request(app).delete(`/api/projects/${src}`);
    expect((await request(app).get(`/api/scenarios/${b[0].id}`)).status).toBe(200);
  });

  it('keeps entity types and ranges through the demo, duplicate and dump', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const types = async (pid: number) =>
      Object.fromEntries(((await request(app).get(`/api/projects/${pid}/entities`)).body as any[]).map((e) => [e.name, [e.type, e.range_min, e.range_max]]));
    expect(await types(src)).toMatchObject({
      ENT_ROOM: ['string', '', ''],
      ENT_TEMP_VALUE: ['number', '15', '30'],
      ENT_TIME: ['time', '05:00', '23:00'],
      ENT_ALARM_DATE: ['date', '', ''],
      ENT_ALARM_REPEAT: ['boolean', '', ''],
    });
    const dup = (await request(app).post(`/api/projects/${src}/duplicate`)).body;
    expect(await types(dup.id)).toEqual(await types(src));
    const dump = (await request(app).get(`/api/projects/${src}/dump`)).body;
    const imported = (await request(app).post('/api/projects/import').send(dump)).body;
    expect(await types(imported.id)).toEqual(await types(src));
  });

  it('exports and imports a dump', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const dump = (await request(app).get(`/api/projects/${src}/dump`)).body;
    expect((await request(app).post('/api/projects/import').send(dump)).status).toBe(201);
  });

    it('keeps scenario connections through duplicate and dump', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const dup = (await request(app).post(`/api/projects/${src}/duplicate`)).body;
    const scenarios = (await request(app).get(`/api/projects/${dup.id}/scenarios`)).body;
    const connected = (await request(app).get(`/api/scenarios/${scenarios[0].id}/intents`)).body;
    expect(connected.length).toBeGreaterThan(0);
    const dump = (await request(app).get(`/api/projects/${src}/dump`)).body;
    expect(dump.tables.scenario_intents.length).toBeGreaterThan(0);
    expect(dump.tables.intents[0]).not.toHaveProperty('scenario_id');
    expect(dump.tables.scenario_steps[0]).not.toHaveProperty('any_intent');
  });

  it('upgrades a dump made before scenario connections', async () => {
    const { app } = await makeApp();
    const step = { scenario_id: 1, part_id: 1, position: 0, kind: 'transition', state: 'A', intent_id: 2, any_intent: 0, request_params: '', condition: '', conditions: '[]', prompt_id: null, system_action: '', next_states: 'B' };
    const old = {
      version: 1, name: 'Старый', description: '',
      tables: {
        scenarios: [{ id: 1, project_id: 1, name: 'S', description: '', layout: '{}' }],
        scenario_parts: [{ id: 1, scenario_id: 1, position: 0, name: 'S', description: '', layout: '{}' }],
        intents: [
          { id: 1, project_id: 1, name: 'INT_OWN', enabled: 1, comment: '', scenario_id: 1 },
          { id: 2, project_id: 1, name: 'INT_USED', enabled: 1, comment: '', scenario_id: null },
          { id: 3, project_id: 1, name: 'INT_FREE', enabled: 1, comment: '', scenario_id: null },
        ],
        prompts: [{ id: 1, project_id: 1, name: 'PRM_OWN', full_answers: '[]', scenario_id: 1 }],
        scenario_steps: [
          { id: 1, ...step },
          { id: 2, ...step, state: 'B', intent_id: null, any_intent: 1, next_states: '' },
        ],
      },
    };
    const res = await request(app).post('/api/projects/import').send(old);
    expect(res.status).toBe(201);
    const pid = res.body.id as number;
    const sid = (await request(app).get(`/api/projects/${pid}/scenarios`)).body[0].id as number;
    expect((await request(app).get(`/api/scenarios/${sid}/intents`)).body.map((i: any) => i.name)).toEqual(['INT_OWN', 'INT_USED']);
    expect((await request(app).get(`/api/scenarios/${sid}/prompts`)).body.map((p: any) => p.name)).toEqual(['PRM_OWN']);
    const intents = (await request(app).get(`/api/projects/${pid}/intents`)).body;
    expect(intents.find((i: any) => i.name === 'INT_FREE').scenarios).toEqual([]);
    expect((await request(app).get(`/api/scenarios/${sid}`)).body.parts[0].steps.map((s: any) => s.kind)).toEqual(['transition', 'error']);
  });

  it('rejects a malformed or hostile dump', async () => {
    const { app } = await makeApp();
    expect((await request(app).post('/api/projects/import').send({ version: 2 })).status).toBe(400);
    const bad = { version: 1, name: 'X', description: '', tables: { entities: [{ 'name) VALUES (1); DROP TABLE projects; --': 'x' }] } };
    expect((await request(app).post('/api/projects/import').send(bad)).status).toBe(400);
    expect((await request(app).get('/api/projects')).status).toBe(200);
  });
});
