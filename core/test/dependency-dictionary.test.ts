import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

describe('dependency dictionary', () => {
  it('creates, edits values, lists, rejects duplicates and deletes', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const c = await request(app).post(`/api/projects/${pid}/dependency-dictionary`).send({ name: 'Двигатель' });
    expect(c.status).toBe(201);
    const put = await request(app).put(`/api/dependency-dictionary/${c.body.id}`).send({ name: 'Двигатель', description: 'Состояние двигателя', values: [' запущен ', 'заглушен', 'запущен', ''] });
    expect(put.body).toMatchObject({ name: 'Двигатель', description: 'Состояние двигателя', values: ['запущен', 'заглушен'] });
    expect((await request(app).get(`/api/projects/${pid}/dependency-dictionary`)).body).toEqual([
      { id: c.body.id, name: 'Двигатель', description: 'Состояние двигателя', values: ['запущен', 'заглушен'], used_by: [] },
    ]);
    expect((await request(app).post(`/api/projects/${pid}/dependency-dictionary`).send({ name: 'Двигатель' })).status).toBe(409);
    expect((await request(app).delete(`/api/dependency-dictionary/${c.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/dependency-dictionary/${c.body.id}`)).status).toBe(404);
  });
});
