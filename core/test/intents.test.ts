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
    expect(list.body).toEqual([{ id: c.body.id, name: 'INT_SEAT_HEATING', enabled: true, phrase_count: 0, hint: '', scenarios: [] }]);
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
    expect((await request(app).get(`/api/projects/${pid}/intents`)).body[0]).toMatchObject({ phrase_count: 2, hint: 'коммент' });
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
  async function twoScenarios() {
    const ctx = await setup();
    const mk = async (name: string) => (await request(ctx.app).post(`/api/projects/${ctx.pid}/scenarios`).send({ name })).body.id as number;
    return { ...ctx, s1: await mk('S1'), s2: await mk('S2') };
  }

  it('connects one intent to several scenarios and lists them', async () => {
    const { app, pid, s1, s2 } = await twoScenarios();
    const a = await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' });
    const put = await request(app).put(`/api/scenarios/${s2}/intents/${a.body.id}`).send({});
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ id: a.body.id, is_global: false });
    const list = (await request(app).get(`/api/projects/${pid}/intents`)).body;
    expect(list[0].scenarios).toEqual([{ id: s1, name: 'S1' }, { id: s2, name: 'S2' }]);
    expect((await request(app).get(`/api/scenarios/${s2}/intents`)).body[0]).toMatchObject({ name: 'INT_A', is_global: false });
  });

  it('keeps the global flag per scenario', async () => {
    const { app, s1, s2 } = await twoScenarios();
    const a = await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' });
    await request(app).put(`/api/scenarios/${s1}/intents/${a.body.id}`).send({ is_global: true });
    await request(app).put(`/api/scenarios/${s2}/intents/${a.body.id}`).send({});
    expect((await request(app).get(`/api/scenarios/${s1}/intents`)).body[0].is_global).toBe(true);
    expect((await request(app).get(`/api/scenarios/${s2}/intents`)).body[0].is_global).toBe(false);
  });

  it('refuses to disconnect an intent that rows still use, and to un-global one with global rows', async () => {
    const { app, db, s1 } = await twoScenarios();
    const a = (await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' })).body.id as number;
    const row = Number(db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'transition', a).lastInsertRowid);
    const refused = await request(app).delete(`/api/scenarios/${s1}/intents/${a}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('in_use');
    db.prepare('DELETE FROM scenario_steps WHERE id = ?').run(row);
    expect((await request(app).delete(`/api/scenarios/${s1}/intents/${a}`)).status).toBe(204);
    expect((await request(app).get(`/api/scenarios/${s1}/intents`)).body).toEqual([]);
    expect((await request(app).delete(`/api/scenarios/${s1}/intents/${a}`)).status).toBe(404);

    await request(app).put(`/api/scenarios/${s1}/intents/${a}`).send({ is_global: true });
    db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'global', a);
    const unglobal = await request(app).put(`/api/scenarios/${s1}/intents/${a}`).send({ is_global: false });
    expect(unglobal.status).toBe(409);
    expect((await request(app).get(`/api/scenarios/${s1}/intents`)).body[0].is_global).toBe(true);
  });

  it('does not connect an intent of another project', async () => {
    const { app, db, s1 } = await twoScenarios();
    const foreign = await request(app).post(`/api/projects/${createProject(db, 'Other')}/intents`).send({ name: 'X' });
    expect((await request(app).put(`/api/scenarios/${s1}/intents/${foreign.body.id}`).send({})).status).toBe(404);
    expect((await request(app).put(`/api/scenarios/999/intents/${foreign.body.id}`).send({})).status).toBe(404);
  });

  it('reports phrase conflicts of a scenario, including intents of other scenarios', async () => {
    const { app, db, pid, entityId, s1, s2 } = await twoScenarios();
    await request(app).put(`/api/entities/${entityId}`).send({ name: 'seat_position', values: [{ value: 'спальня', synonyms: ['кухня'] }] });
    const make = async (sid: number, name: string, phrases: string[], enabled = true) => {
      const id = (await request(app).post(`/api/scenarios/${sid}/intents`).send({ name })).body.id as number;
      await request(app).put(`/api/intents/${id}`).send({ name, enabled, phrases, entities: [{ entity_id: entityId, required: false }] });
      return id;
    };
    const a = await make(s1, 'A', ['включи свет', 'включи свет в спальня']);
    const b = await make(s2, 'B', ['Включи свет', 'включи свет в кухня']);
    await make(s2, 'OFF', ['включи свет'], false);
    const s3 = Number(db.prepare('INSERT INTO scenarios(project_id, name) VALUES (?, ?)').run(pid, 'S3').lastInsertRowid);
    const c = await make(s3, 'C', ['включи свет']);

    const r = await request(app).get(`/api/scenarios/${s1}/intents/conflicts`);
    expect(r.status).toBe(200);
    expect(r.body.map((p: any) => [p.kind, p.a.id, p.b.id])).toEqual([['exact', a, b], ['exact', a, c], ['template', a, b]]);
    expect(r.body[0].b.scenarios).toEqual([{ id: s2, name: 'S2' }]);

    const other = await request(app).get(`/api/scenarios/${s3}/intents/conflicts`);
    expect(other.body.map((p: any) => [p.a.id, p.b.id])).toEqual([[a, c], [b, c]]);
    expect((await request(app).get('/api/scenarios/999/intents/conflicts')).status).toBe(404);
  });

  it('deleting an intent removes its global rows', async () => {
    const { app, db, s1 } = await twoScenarios();
    const a = (await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' })).body.id as number;
    db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'global', a);
    db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'transition', a);
    await request(app).delete(`/api/intents/${a}`);
    expect(db.prepare('SELECT kind FROM scenario_steps').all()).toEqual([{ kind: 'transition' }]);
  });
});
