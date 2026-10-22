import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

describe('предпросмотр, экспорт проекта, использование', () => {
  it('отдаёт markdown сценария без attachment', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const s = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Обогрев' });
    const res = await request(app).get(`/api/scenarios/${s.body.id}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.text).toContain('# Обогрев');
  });

  it('экспортирует проект целиком', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db, 'Проект');
    const md = await request(app).get(`/api/projects/${pid}/export?format=md`);
    expect(md.status).toBe(200);
    expect(md.text).toContain('# Проект');
    expect((await request(app).get(`/api/projects/${pid}/export?format=pdf`)).status).toBe(400);
  });

  it('промпты: has_answer и step_count', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const s = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const p = await request(app).post(`/api/scenarios/${s.body.id}/prompts`).send({ name: 'PRM' });
    let list = await request(app).get(`/api/scenarios/${s.body.id}/prompts`);
    expect(list.body[0]).toMatchObject({ has_answer: false, step_count: 0 });
    await request(app).put(`/api/prompts/${p.body.id}`).send({ name: 'PRM', full_answers: ['Готово'] });
    list = await request(app).get(`/api/scenarios/${s.body.id}/prompts`);
    expect(list.body[0].has_answer).toBe(true);
  });

  it('справочник зависимостей показывает сценарии, где он использован', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    await request(app).post(`/api/projects/${pid}/dependency-dictionary`).send({ name: 'Режим' });
    const s = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    db.prepare("INSERT INTO scenario_dependencies(scenario_id, ref, name) VALUES (?, 'r1', 'Режим')").run(s.body.id);
    const list = await request(app).get(`/api/projects/${pid}/dependency-dictionary`);
    expect(list.body[0].used_by).toEqual([{ id: s.body.id, name: 'S' }]);
  });
});
