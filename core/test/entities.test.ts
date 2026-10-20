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
    expect(refused.body.details.intents).toEqual([{ id: Number(intent.lastInsertRowid), name: 'Вернуться', scenario_id: null }]);

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

  it('returns 404 for a missing entity', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/entities/999')).status).toBe(404);
  });
});
