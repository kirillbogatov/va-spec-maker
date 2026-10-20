import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

async function setup() {
  const { app, db } = await makeApp();
  const pid = createProject(db);
  const e = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'seat_position' });
  return { app, db, pid, entityId: e.body.id as number };
}

describe('intents API', () => {
  it('creates an intent and lists it with phrase count', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'INT_SEAT_HEATING' });
    expect(c.status).toBe(201);
    const get = await request(app).get(`/api/intents/${c.body.id}`);
    expect(get.body).toMatchObject({ name: 'INT_SEAT_HEATING', enabled: true, phrases: [], entities: [] });
    const list = await request(app).get(`/api/projects/${pid}/intents`);
    expect(list.body).toEqual([{ id: c.body.id, name: 'INT_SEAT_HEATING', enabled: true, scenario_id: null, phrase_count: 0 }]);
  });

  it('PUT replaces phrases and entities', async () => {
    const { app, pid, entityId } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'INT_SET' });
    const put = await request(app).put(`/api/intents/${c.body.id}`).send({
      name: 'INT_SET', enabled: false, comment: 'коммент',
      phrases: [' на минимум ', '', 'на максимум'], entities: [{ entity_id: entityId, required: true }],
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      enabled: false, comment: 'коммент', phrases: ['на минимум', 'на максимум'], entities: [{ entity_id: entityId, required: true }],
    });
    expect((await request(app).get(`/api/projects/${pid}/intents`)).body[0].phrase_count).toBe(2);
    const again = await request(app).put(`/api/intents/${c.body.id}`).send({ name: 'INT_SET' });
    expect(again.body).toMatchObject({ phrases: [], entities: [], enabled: true });
  });

  it('rejects an entity from another project', async () => {
    const { app, db, pid } = await setup();
    const other = createProject(db, 'Other');
    const foreign = await request(app).post(`/api/projects/${other}/entities`).send({ name: 'x' });
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    const put = request(app).put(`/api/intents/${c.body.id}`).send({ name: 'A', entities: [{ entity_id: foreign.body.id, required: false }] });
    expect((await put).status).toBe(400);
  });

  it('rejects duplicate intent names with 409', async () => {
    const { app, pid } = await setup();
    await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    const dup = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    expect(dup.status).toBe(409);
  });

  it('deleting an intent keeps scenario rows but clears their intent', async () => {
    const { app, db, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    const sc = db.prepare('INSERT INTO scenarios(project_id, name) VALUES (?, ?)').run(pid, 'S');
    db.prepare('INSERT INTO scenario_steps(scenario_id, intent_id) VALUES (?, ?)').run(sc.lastInsertRowid, c.body.id);
    const del = await request(app).delete(`/api/intents/${c.body.id}`);
    expect(del.status).toBe(204);
    expect(db.prepare('SELECT intent_id FROM scenario_steps').get()).toEqual({ intent_id: null });
  });

  it('binds intents to a scenario and keeps names unique per project', async () => {
    const { app, pid } = await setup();
    const s1 = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S1' })).body.id as number;
    const s2 = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S2' })).body.id as number;
    const a = await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' });
    expect(a.status).toBe(201);
    expect((await request(app).post(`/api/scenarios/${s2}/intents`).send({ name: ' int_a ' })).status).toBe(409);
    const b = await request(app).post(`/api/scenarios/${s2}/intents`).send({ name: 'INT_B' });
    expect((await request(app).get(`/api/scenarios/${s1}/intents`)).body.map((i: any) => i.name)).toEqual(['INT_A']);
    expect((await request(app).get(`/api/scenarios/${s2}/intents`)).body.map((i: any) => i.name)).toEqual(['INT_B']);
    const rename = await request(app).put(`/api/intents/${b.body.id}`).send({ name: 'INT_A' });
    expect(rename.status).toBe(409);
    expect(rename.body.message).toContain('INT_A');
    expect((await request(app).put(`/api/intents/${b.body.id}`).send({ name: 'int_b' })).status).toBe(200);
    expect((await request(app).post('/api/scenarios/999/intents').send({ name: 'X' })).status).toBe(404);
  });
});
