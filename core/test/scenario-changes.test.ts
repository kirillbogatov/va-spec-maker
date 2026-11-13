import { expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

it('сохраняет отметку о просмотренном изменении отдельно от экспорта', async () => {
  const { app, db } = await makeApp();
  const pid = createProject(db);
  const intent = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'INT_TEST' });
  const scenario = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'SC_TEST' });
  const sid = scenario.body.id as number;
  const iid = intent.body.id as number;
  await request(app).put(`/api/scenarios/${sid}/intents/${iid}`).send({});
  await request(app).put(`/api/intents/${iid}`).send({ name: 'INT_TEST', values: [{ text: 'новая фраза', kind: 'phrase' }], entities: [] });

  const changes = await request(app).get(`/api/scenarios/${sid}/changes`);
  expect(changes.body.changes).toHaveLength(1);
  const id = changes.body.changes[0].id as number;
  await request(app).put(`/api/scenarios/${sid}/changes`).send({ change_ids: [id], reviewed: true });
  const reviewed = await request(app).get(`/api/scenarios/${sid}/changes`);
  expect(reviewed.body.changes[0].reviewed_at).not.toBeNull();
});
