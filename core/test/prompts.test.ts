import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

async function setup() {
  const { app, db } = await makeApp();
  return { app, pid: createProject(db) };
}

describe('prompts API', () => {
  it('creates, edits, lists and deletes a prompt', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM_TEMPERATURE_SET' });
    expect(c.status).toBe(201);
    const put = await request(app).put(`/api/prompts/${c.body.id}`).send({
      name: 'PRM_TEMPERATURE_SET', full_answers: ['Устанавливаю температуру на Х градусов'],
    });
    expect(put.body).toMatchObject({ full_answers: ['Устанавливаю температуру на Х градусов'] });
    expect((await request(app).get(`/api/projects/${pid}/prompts`)).body).toEqual([
      { id: c.body.id, name: 'PRM_TEMPERATURE_SET', scenarios: [], has_answer: expect.any(Boolean), hint: expect.any(String), step_count: 0 },
    ]);
    expect((await request(app).delete(`/api/prompts/${c.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/prompts/${c.body.id}`)).status).toBe(404);
  });

  it('rejects duplicate and empty names', async () => {
    const { app, pid } = await setup();
    await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'A' });
    expect((await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'A' })).status).toBe(409);
    expect((await request(app).post(`/api/projects/${pid}/prompts`).send({ name: ' ' })).status).toBe(400);
  });

  it('binds prompts to a scenario and keeps names unique per project', async () => {
    const { app, pid } = await setup();
    const s1 = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S1' })).body.id as number;
    const s2 = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S2' })).body.id as number;
    await request(app).post(`/api/scenarios/${s1}/prompts`).send({ name: 'PRM_A' });
    expect((await request(app).post(`/api/scenarios/${s2}/prompts`).send({ name: 'prm_a' })).status).toBe(409);
    const b = await request(app).post(`/api/scenarios/${s2}/prompts`).send({ name: 'PRM_B' });
    expect((await request(app).get(`/api/scenarios/${s2}/prompts`)).body.map((p: any) => p.name)).toEqual(['PRM_B']);
    expect((await request(app).put(`/api/prompts/${b.body.id}`).send({ name: 'PRM_A' })).status).toBe(409);
  });
  it('connects one prompt to several scenarios and refuses to disconnect it while rows use it', async () => {
    const { app, pid } = await setup();
    const mk = async (name: string) => (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name })).body.id as number;
    const [s1, s2] = [await mk('S1'), await mk('S2')];
    const p = (await request(app).post(`/api/scenarios/${s1}/prompts`).send({ name: 'PRM_A' })).body.id as number;
    expect((await request(app).put(`/api/scenarios/${s2}/prompts/${p}`).send({})).body).toEqual({ id: p });
    expect((await request(app).get(`/api/projects/${pid}/prompts`)).body[0].scenarios).toEqual([{ id: s1, name: 'S1' }, { id: s2, name: 'S2' }]);

    await request(app).put(`/api/scenarios/${s1}`).send({
      name: 'S1', parts: [{ steps: [{ kind: 'error', state: 'A', prompt_id: p }] }],
    });
    const refused = await request(app).delete(`/api/scenarios/${s1}/prompts/${p}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('in_use');
    expect((await request(app).delete(`/api/scenarios/${s2}/prompts/${p}`)).status).toBe(204);
    expect((await request(app).get(`/api/scenarios/${s2}/prompts`)).body).toEqual([]);
    expect((await request(app).get(`/api/prompts/${p}`)).status).toBe(200);
  });
});
