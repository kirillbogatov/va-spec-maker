import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

async function setup() {
  const { app, db } = await makeApp();
  return { app, db, pid: createProject(db) };
}

describe('entities API', () => {
  it('creates and lists entities with value counts', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'compliment' });
    expect(c.status).toBe(201);
    const list = await request(app).get(`/api/projects/${pid}/entities`);
    expect(list.body).toMatchObject([{ id: c.body.id, name: 'compliment', value_count: 0 }]);
  });

  it('rejects duplicate names with 409', async () => {
    const { app, pid } = await setup();
    await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'a' });
    const dup = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'a' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('duplicate');
  });

  it('PUT replaces values, trims synonyms and drops empty values', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'compliment' });
    const put = await request(app)
      .put(`/api/entities/${c.body.id}`)
      .send({
        name: 'compliment',
        description: 'Похвала',
        values: [
          { value: ' красавчик ', synonyms: [' молодец ', '', 'умница'] },
          { value: '  ', synonyms: ['x'] },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.description).toBe('Похвала');
    expect(put.body.values).toEqual([{ value: 'красавчик', synonyms: ['молодец', 'умница'] }]);
    const get = await request(app).get(`/api/entities/${c.body.id}`);
    expect(get.body.values).toHaveLength(1);
    expect(get.body.used_by).toEqual([]);
  });

  it('refuses to delete a used entity without force and removes its bindings with force', async () => {
    const { app, db, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'compliment' });
    const intent = db.prepare('INSERT INTO intents(project_id, name) VALUES (?, ?)').run(pid, 'Вернуться');
    db.prepare('INSERT INTO intent_entities(intent_id, entity_id) VALUES (?, ?)').run(intent.lastInsertRowid, c.body.id);

    const refused = await request(app).delete(`/api/entities/${c.body.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('in_use');
    expect(refused.body.details.intents).toEqual([{ id: Number(intent.lastInsertRowid), name: 'Вернуться', scenario_ids: [] }]);

    const forced = await request(app).delete(`/api/entities/${c.body.id}?force=1`);
    expect(forced.status).toBe(204);
    expect(db.prepare('SELECT COUNT(*) AS n FROM intent_entities').get()).toEqual({ n: 0 });
  });

  it('stores multiple_values', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'seat_position' });
    const put = await request(app)
      .put(`/api/entities/${c.body.id}`)
      .send({ name: 'seat_position', description: '', multiple_values: true, values: [] });
    expect(put.body).toMatchObject({ multiple_values: true });
  });

  it('defaults to the string type', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'a' });
    const get = await request(app).get(`/api/entities/${c.body.id}`);
    expect(get.body).toMatchObject({ type: 'string', range_min: '', range_max: '' });
  });

  it('creates a typed entity with a range', async () => {
    const { app, pid } = await setup();
    const c = await request(app)
      .post(`/api/projects/${pid}/entities`)
      .send({ name: 'temp', type: 'number', range_min: '15', range_max: '30' });
    expect(c.status).toBe(201);
    const list = await request(app).get(`/api/projects/${pid}/entities`);
    expect(list.body[0]).toMatchObject({ type: 'number', range_min: '15', range_max: '30' });
  });

  it('accepts one-sided ranges for number, time and date', async () => {
    const { app, pid } = await setup();
    const ok = async (name: string, type: string, range_min: string, range_max: string) =>
      (await request(app).post(`/api/projects/${pid}/entities`).send({ name, type, range_min, range_max })).status;
    expect(await ok('n', 'number', '-1.5', '')).toBe(201);
    expect(await ok('t', 'time', '', '23:00')).toBe(201);
    expect(await ok('d', 'date', '2026-01-01', '2026-12-31')).toBe(201);
  });

  it('rejects unknown types, bad bounds and inverted ranges', async () => {
    const { app, pid } = await setup();
    const post = (body: object) => request(app).post(`/api/projects/${pid}/entities`).send({ name: 'x', ...body });
    expect((await post({ type: 'color' })).status).toBe(400);
    expect((await post({ type: 'number', range_min: 'abc' })).status).toBe(400);
    expect((await post({ type: 'time', range_min: '25:00' })).status).toBe(400);
    expect((await post({ type: 'date', range_min: '2026-02-30' })).status).toBe(400);
    expect((await post({ type: 'number', range_min: '30', range_max: '15' })).status).toBe(400);
    expect((await post({ type: 'time', range_min: '22:00', range_max: '06:00' })).status).toBe(400);
    expect((await post({ type: 'string', range_min: '1' })).status).toBe(400);
    expect((await post({ type: 'boolean', range_max: '1' })).status).toBe(400);
  });

  it('drops values when the type changes away from string', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'room' });
    await request(app)
      .put(`/api/entities/${c.body.id}`)
      .send({ name: 'room', values: [{ value: 'kitchen', synonyms: ['кухня'] }] });
    const put = await request(app)
      .put(`/api/entities/${c.body.id}`)
      .send({ name: 'room', type: 'number', range_min: '1', range_max: '5', values: [{ value: 'kitchen', synonyms: [] }] });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ type: 'number', range_min: '1', range_max: '5', values: [] });
  });

  it('keeps type and range when PUT omits them, and resets the range when only the type changes', async () => {
    const { app, pid } = await setup();
    const c = await request(app)
      .post(`/api/projects/${pid}/entities`)
      .send({ name: 'temp', type: 'number', range_min: '15', range_max: '30' });
    const keep = await request(app).put(`/api/entities/${c.body.id}`).send({ name: 'temp', description: 'x' });
    expect(keep.body).toMatchObject({ type: 'number', range_min: '15', range_max: '30' });
    const change = await request(app).put(`/api/entities/${c.body.id}`).send({ name: 'temp', type: 'boolean' });
    expect(change.body).toMatchObject({ type: 'boolean', range_min: '', range_max: '' });
  });

  it('returns 404 for a missing entity', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/entities/999')).status).toBe(404);
  });
});
