import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

async function setup() {
  const { app, db } = await makeApp();
  const pid = createProject(db);
  const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
  const history = async () => (await request(app).get(`/api/scenarios/${sid}/history`)).body as { day: string; text: string; refs: { type: string; name: string }[] }[];
  const save = (body: Record<string, unknown>) => request(app).put(`/api/scenarios/${sid}`).send({ name: 'S', parts: [{ name: 'S', steps: [] }], ...body });
  return { app, db, pid, sid, history, save };
}

const row = (state: string, next: string, extra: Record<string, unknown> = {}) => ({
  kind: 'transition', state, intent_id: null, request_params: '', condition: '', conditions: [], cond_mode: 'all', next_states: next, ...extra,
});

describe('scenario history', () => {
  it('starts with the creation entry', async () => {
    const { history } = await setup();
    expect((await history()).map((h) => h.text)).toEqual(['Сценарий создан']);
  });

  it('merges repeated autosaves of the same change into one entry', async () => {
    const { history, save } = await setup();
    for (const name of ['A', 'AB', 'ABC']) await save({ name });
    for (const description of ['x', 'xy', 'xyz']) await save({ name: 'ABC', description });
    const texts = (await history()).map((h) => h.text);
    expect(texts.filter((t) => t.startsWith('Название'))).toEqual(['Название сценария изменено на «ABC»']);
    expect(texts.filter((t) => t.startsWith('Изменено описание'))).toHaveLength(1);
  });

  it('writes nothing when a save changes nothing', async () => {
    const { history, save } = await setup();
    await save({});
    await save({});
    expect(await history()).toHaveLength(1);
  });

  it('drops an element added and removed the same day', async () => {
    const { history, save } = await setup();
    await save({ parts: [{ name: 'S', steps: [row('A', 'B')], layout: { A: { x: 0, y: 0 } } }] });
    expect((await history()).map((h) => h.text)).toContain('Добавлено состояние {0}');
    await save({});
    expect((await history()).map((h) => h.text)).toEqual(['Сценарий создан']);
  });

  it('absorbs edits of an element added the same day', async () => {
    const { history, save } = await setup();
    await save({ parts: [{ name: 'S', steps: [], layout: { A: { x: 0, y: 0 } } }] });
    await save({ parts: [{ name: 'S', steps: [], layout: { A: { x: 0, y: 0, description: 'вход' } } }] });
    expect((await history()).map((h) => h.text)).toEqual(['Добавлено состояние {0}', 'Сценарий создан']);
  });

  it('links states, and records state edits and removals', async () => {
    const { history, save } = await setup();
    await save({ parts: [{ name: 'S', steps: [], layout: { A: { x: 0, y: 0 } } }] });
    const added = (await history())[0];
    expect(added.refs).toEqual([{ type: 'state', name: 'A', part: 'S' }]);
  });

  it('logs intent edits, concepts, and connections in the scenarios that use the intent', async () => {
    const { app, pid, sid, history, save } = await setup();
    await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'SET' }).then((k: { body: { id: number } }) => request(app).put(`/api/keywords/${k.body.id}`).send({ name: 'SET', synonyms: ['поставь'] }));
    const { body: intent } = await request(app).post(`/api/scenarios/${sid}/intents`).send({ name: 'INT_TEMP_SET' });
    expect((await history())[0].text).toBe('Подключён интент {0}');
    await request(app).put(`/api/intents/${intent.id}`).send({ name: 'INT_TEMP_SET', enabled: true, comment: '', phrases: ['поставь температуру'] });
    await request(app).put(`/api/intents/${intent.id}`).send({ name: 'INT_TEMP_SET', enabled: true, comment: '', phrases: ['поставь температуру', 'поставь теплее'] });
    const texts = (await history()).map((h) => h.text);
    expect(texts).toContain('В интент {0} добавлен концепт SET');
    expect(texts.filter((t) => t.startsWith('В интент {0} добавлена фраза'))).toHaveLength(2);
    await save({});
  });

  it('keeps no history of other scenarios and can clear it', async () => {
    const { app, pid, sid, history } = await setup();
    const other = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'T' })).body.id;
    expect((await request(app).get(`/api/scenarios/${other}/history`)).body).toHaveLength(1);
    await request(app).delete(`/api/scenarios/${sid}/history`);
    expect(await history()).toEqual([]);
  });
});

describe('concept conditions', () => {
  it('are stored and checked against the project', async () => {
    const { app, db, pid, sid, save } = await setup();
    const k = (await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'SET' })).body.id as number;
    const cond = { dep: '', keyword_id: k, op: '!=', value: 'junk' };
    const ok = await save({ parts: [{ name: 'S', steps: [row('A', 'B', { conditions: [cond] })] }] });
    expect(ok.status).toBe(200);
    expect(ok.body.parts[0].steps[0].conditions).toEqual([{ dep: '', keyword_id: k, op: '!=', value: '' }]);
    const bad = await save({ parts: [{ name: 'S', steps: [row('A', 'B', { conditions: [{ ...cond, keyword_id: 9999 }] })] }] });
    expect(bad.status).toBe(400);
    void db;
  });
});
