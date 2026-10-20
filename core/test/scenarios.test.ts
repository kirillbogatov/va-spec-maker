import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

async function setup() {
  const { app, db } = await makeApp();
  const pid = createProject(db);
  const i = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'INT_SEAT_HEATING' });
  return { app, db, pid, intentId: i.body.id as number };
}

describe('scenarios API', () => {
  it('creates, lists and loads an empty scenario', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Обогрев сидений' });
    expect(c.status).toBe(201);
    expect((await request(app).get(`/api/projects/${pid}/scenarios`)).body).toEqual([
      { id: c.body.id, name: 'Обогрев сидений', step_count: 0 },
    ]);
    expect((await request(app).get(`/api/scenarios/${c.body.id}`)).body).toMatchObject({
      name: 'Обогрев сидений', description: '', parts: [{ name: 'Обогрев сидений', description: '', steps: [], layout: {} }],
    });
  });

  it('PUT replaces rows, keeps their order and kind', async () => {
    const { app, pid, intentId } = await setup();
    const pr = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM_ON' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const row = {
      kind: 'transition', state: 'ST_A', intent_id: intentId, any_intent: false, request_params: '', condition: 'выключен', conditions: [],
      prompt_id: pr.body.id, system_action: 'Включить', next_states: '-',
    };
    const err = { ...row, kind: 'error', state: 'DRIVER_ONLY', intent_id: null };
    const put = await request(app)
      .put(`/api/scenarios/${c.body.id}`)
      .send({ name: 'S', description: 'описание', parts: [{ name: 'P', steps: [{ key: 'k', ...row }, err] }] });
    expect(put.status).toBe(200);
    // ответ и действие перехода живут в состоянии: в строке перехода они сбрасываются, в строке ошибки сохраняются
    expect(put.body.parts[0].steps).toEqual([{ ...row, prompt_id: null, system_action: '' }, err]);
    expect((await request(app).get(`/api/projects/${pid}/scenarios`)).body[0].step_count).toBe(2);
  });

  it('stores "any intent of the scenario" and drops the intent id', async () => {
    const { app, pid, intentId } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const step = { kind: 'transition', state: 'ST_A', intent_id: intentId, any_intent: true, next_states: 'ST_B' };
    const put = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [{ name: 'P', steps: [step] }] });
    expect(put.status).toBe(200);
    expect(put.body.parts[0].steps[0]).toMatchObject({ intent_id: null, any_intent: true });
  });

  it('rejects an intent or a prompt from another project', async () => {
    const { app, db, pid } = await setup();
    const other = { body: { id: createProject(db, 'Other') } };
    const foreign = await request(app).post(`/api/projects/${other.body.id}/intents`).send({ name: 'X' });
    const foreignPrompt = await request(app).post(`/api/projects/${other.body.id}/prompts`).send({ name: 'P' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const put = (step: object) =>
      request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', description: '', parts: [{ steps: [step] }] });
    expect((await put({ intent_id: foreign.body.id })).status).toBe(400);
    expect((await put({ kind: 'error', prompt_id: foreignPrompt.body.id })).status).toBe(400);
    const state = await request(app).put(`/api/scenarios/${c.body.id}`)
      .send({ name: 'S', parts: [{ layout: { ST_A: { x: 0, y: 0, prompt_id: foreignPrompt.body.id } } }] });
    expect(state.status).toBe(400);
  });

  it('stores description, response and action on a state and returns them from the layout', async () => {
    const { app, pid } = await setup();
    const pr = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM_ON' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const layout = {
      ST_A: { x: 0, y: 0, description: 'Ждём ответ', prompt_id: pr.body.id, system_action: 'Включить' },
      ST_B: { x: 0, y: 0 },
    };
    const put = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [{ layout }] });
    expect(put.body.parts[0].layout.ST_A).toEqual(layout.ST_A);
    expect(put.body.parts[0].layout.ST_B).toEqual({ x: 0, y: 0, description: '', prompt_id: null, system_action: '' });
    const again = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S2' });
    expect(again.body.parts[0].layout.ST_A).toEqual(layout.ST_A);
    expect((await request(app).get(`/api/prompts/${pr.body.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/scenarios/${c.body.id}/prompts`)).body).toEqual([]);
    expect((await request(app).get(`/api/projects/${pid}/prompts`)).body[0].step_count).toBe(1);
  });

  it('deleting a prompt keeps the rows and states but clears their prompt', async () => {
    const { app, pid } = await setup();
    const pr = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    await request(app).put(`/api/scenarios/${c.body.id}`).send({
      name: 'S', parts: [{ steps: [{ kind: 'error', state: 'A', prompt_id: pr.body.id }], layout: { A: { x: 0, y: 0, prompt_id: pr.body.id } } }],
    });
    await request(app).delete(`/api/prompts/${pr.body.id}`);
    const after = (await request(app).get(`/api/scenarios/${c.body.id}`)).body;
    expect(after.parts[0].steps[0].prompt_id).toBeNull();
    expect(after.parts[0].layout.A.prompt_id).toBeNull();
  });

  it('stores dependencies and structured step conditions', async () => {
    const { app, pid } = await setup();
    const en = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'seat_position' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const dependencies = [
      { ref: 'a', entity_id: en.body.id, name: '', type: 'enum', options: ['Driver', 'All'] },
      { ref: 'b', entity_id: null, name: 'Двигатель запущен', type: 'bool', options: [] },
    ];
    const conditions = [{ dep: 'a', op: '!=', value: 'Driver' }, { dep: 'b', op: '=', value: 'true' }];
    const put = await request(app)
      .put(`/api/scenarios/${c.body.id}`)
      .send({ name: 'S', dependencies, parts: [{ steps: [{ state: 'A', conditions }] }] });
    expect(put.status).toBe(200);
    expect(put.body.dependencies).toEqual(dependencies);
    expect(put.body.parts[0].steps[0].conditions).toEqual(conditions);
    const bad = await request(app)
      .put(`/api/scenarios/${c.body.id}`)
      .send({ name: 'S', dependencies, parts: [{ steps: [{ conditions: [{ dep: 'zzz', value: 'x' }] }] }] });
    expect(bad.status).toBe(400);
  });

  it('stores conditions on an entity value', async () => {
    const { app, pid } = await setup();
    const en = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'seat_position' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const conditions = [{ dep: '', entity_id: en.body.id, op: '>', value: 'Driver' }];
    const put = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [{ steps: [{ state: 'A', conditions }] }] });
    expect(put.status).toBe(200);
    expect(put.body.parts[0].steps[0].conditions).toEqual(conditions);
    const bad = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [{ steps: [{ conditions: [{ entity_id: 99999, value: 'x' }] }] }] });
    expect(bad.status).toBe(400);
  });

  it('stores per-scenario entities with their follow-up prompt', async () => {
    const { app, pid } = await setup();
    const en = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'seat_position' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const entities = [{ entity_id: en.body.id, followup_prompt: 'Для какого сиденья?', required: true, is_array: true }];
    const put = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', entities });
    expect(put.status).toBe(200);
    expect(put.body.entities).toEqual(entities);
    const dup = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', entities: [...entities, ...entities] });
    expect(dup.status).toBe(400);
    const missing = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', entities: [{ entity_id: 999 }] });
    expect(missing.status).toBe(400);
  });

  it('stores node layout, drops malformed points and keeps it when omitted', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    expect((await request(app).get(`/api/scenarios/${c.body.id}`)).body.parts[0].layout).toEqual({});
    const put = await request(app)
      .put(`/api/scenarios/${c.body.id}`)
      .send({ name: 'S', parts: [{ layout: { ST_A: { x: 10.4, y: 20 }, ST_BAD: { x: 'a', y: 1 }, '': { x: 1, y: 1 } } }] });
    expect(put.status).toBe(200);
    const st = { x: 10, y: 20, description: '', prompt_id: null, system_action: '' };
    expect(put.body.parts[0].layout).toEqual({ ST_A: st });
    const again = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S2' });
    expect(again.body.parts[0].layout).toEqual({ ST_A: st });
  });

  it('keeps several parts (tabs) with their own rows, states and description', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const parts = [
      { name: 'Включение', description: 'Включает обогрев', steps: [{ state: 'A', next_states: 'ON' }], layout: { ON: { x: 0, y: 0, system_action: 'Включить' } } },
      { name: 'Выключение', description: '', steps: [{ state: 'A', next_states: 'OFF' }], layout: { OFF: { x: 0, y: 0, system_action: 'Выключить' } } },
    ];
    const put = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts });
    expect(put.status).toBe(200);
    expect(put.body.parts.map((p: any) => [p.name, p.description, p.steps.length, Object.keys(p.layout)])).toEqual([
      ['Включение', 'Включает обогрев', 1, ['ON']],
      ['Выключение', '', 1, ['OFF']],
    ]);
    expect((await request(app).get(`/api/projects/${pid}/scenarios`)).body[0].step_count).toBe(2);
    expect((await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [] })).status).toBe(400);
    const dropped = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [parts[0]] });
    expect(dropped.body.parts).toHaveLength(1);
  });

  it('deletes a scenario', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    expect((await request(app).delete(`/api/scenarios/${c.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/scenarios/${c.body.id}`)).status).toBe(404);
  });
});
