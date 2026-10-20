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
});

describe('project duplicate / import', () => {
  it('duplicates a project with content and keeps references consistent', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const dup = (await request(app).post(`/api/projects/${src}/duplicate`)).body;
    expect(dup.name).toMatch(/\(копия\)$/);
    const sc = (id: number) => request(app).get(`/api/projects/${id}/scenarios`);
    const [a, b] = [(await sc(src)).body, (await sc(dup.id)).body];
    expect(b).toHaveLength(a.length);
    const full = (await request(app).get(`/api/scenarios/${b[0].id}`)).body;
    expect(full.project_id).toBe(dup.id);
    expect(full.parts[0].steps).toHaveLength(2);
    expect((await request(app).get(`/api/projects/${dup.id}/intents`)).body.length).toBeGreaterThan(0);
    await request(app).delete(`/api/projects/${src}`);
    expect((await request(app).get(`/api/scenarios/${b[0].id}`)).status).toBe(200);
  });

  it('exports and imports a dump', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const dump = (await request(app).get(`/api/projects/${src}/dump`)).body;
    expect((await request(app).post('/api/projects/import').send(dump)).status).toBe(201);
  });

  it('rejects a malformed or hostile dump', async () => {
    const { app } = await makeApp();
    expect((await request(app).post('/api/projects/import').send({ version: 2 })).status).toBe(400);
    const bad = { version: 1, name: 'X', description: '', tables: { entities: [{ 'name) VALUES (1); DROP TABLE projects; --': 'x' }] } };
    expect((await request(app).post('/api/projects/import').send(bad)).status).toBe(400);
    expect((await request(app).get('/api/projects')).status).toBe(200);
  });
});
