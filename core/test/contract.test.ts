import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';

/**
 * Контрольная проверка реализации против контракта forge-wiki/openapi/app:
 * каждая операция вызывается на живом роутере, статус и ключи ответа сверяются с файлом операции.
 * Тест пропускается, если вики нет рядом с кодом.
 */
const PATHS = path.resolve(__dirname, '../../forge-wiki/openapi/app/paths');
const files = (() => {
  try {
    return readdirSync(PATHS);
  } catch {
    return [] as string[];
  }
})();

const slug = (method: string, p: string) => `${method.toLowerCase()}_${p.replace('/api/', '').replace(/\{(\w+)\}/g, '$1').replace(/\//g, '-')}.json`;

interface Call { method: string; path: string; body?: unknown; status: number; error?: string }

describe.skipIf(!files.length)('контракт openapi/app против реализации', () => {
  it('каждая операция контракта имеет рабочий маршрут и ответ по схеме', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db, 'Контракт');
    const post = async (url: string, body?: unknown) => (await request(app).post(url).send(body)).body as any;

    const ent = await post(`/api/projects/${pid}/entities`, { name: 'ENT_A', type: 'number', range_min: '1', range_max: '5' });
    const entStr = await post(`/api/projects/${pid}/entities`, { name: 'ENT_S' });
    const intent = await post(`/api/projects/${pid}/intents`, { name: 'INT_A' });
    await request(app).put(`/api/intents/${intent.id}`).send({ name: 'INT_A', values: [{ text: 'включи', kind: 'phrase' }], entities: [{ entity_id: entStr.id, required: true }] });
    const intent2 = await post(`/api/projects/${pid}/intents`, { name: 'INT_B' });
    const prompt = await post(`/api/projects/${pid}/prompts`, { name: 'PRM_A' });
    await request(app).put(`/api/prompts/${prompt.id}`).send({ name: 'PRM_A', full_answers: ['Готово'] });
    const prompt2 = await post(`/api/projects/${pid}/prompts`, { name: 'PRM_B' });
    const dep = await post(`/api/projects/${pid}/dependency-dictionary`, { name: 'DEP_A' });
    const kw = await post(`/api/projects/${pid}/keywords`, { name: 'ON' });
    const kw2 = await post(`/api/projects/${pid}/keywords`, { name: 'TMP' });
    const sc = await post(`/api/projects/${pid}/scenarios`, { name: 'SC_A' });
    const sc2 = await post(`/api/projects/${pid}/scenarios`, { name: 'SC_TMP' });
    await request(app).put(`/api/scenarios/${sc.id}/intents/${intent.id}`).send({});
    await request(app).put(`/api/scenarios/${sc.id}/prompts/${prompt.id}`).send({});
    const dump = (await request(app).get(`/api/projects/${pid}/dump`)).body;

    const calls: Call[] = [
      { method: 'GET', path: '/api/projects', status: 200 },
      { method: 'POST', path: '/api/projects', body: { name: 'Новый' }, status: 201 },
      { method: 'PATCH', path: `/api/projects/${pid}`, body: { name: 'Контракт', description: 'd' }, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/duplicate`, status: 201 },
      { method: 'GET', path: `/api/projects/${pid}/dump`, status: 200 },
      { method: 'POST', path: '/api/projects/import', body: dump, status: 201 },
      { method: 'GET', path: `/api/projects/${pid}/intents`, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/intents`, body: { name: 'INT_C' }, status: 201 },
      { method: 'GET', path: `/api/intents/${intent.id}`, status: 200 },
      { method: 'PUT', path: `/api/intents/${intent.id}`, body: { name: 'INT_A', enabled: true, comment: '', values: [{ text: 'включи', kind: 'phrase' }], entities: [] }, status: 200 },
      { method: 'GET', path: `/api/projects/${pid}/entities`, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/entities`, body: { name: 'ENT_C', type: 'time', range_min: '05:00', range_max: '23:00' }, status: 201 },
      { method: 'GET', path: `/api/entities/${ent.id}`, status: 200 },
      { method: 'PUT', path: `/api/entities/${entStr.id}`, body: { name: 'ENT_S', multiple_values: true, type: 'string', values: [{ value: 'кухня', synonyms: ['на кухне'] }] }, status: 200 },
      { method: 'GET', path: `/api/projects/${pid}/prompts`, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/prompts`, body: { name: 'PRM_C' }, status: 201 },
      { method: 'GET', path: `/api/prompts/${prompt.id}`, status: 200 },
      { method: 'PUT', path: `/api/prompts/${prompt.id}`, body: { name: 'PRM_A', full_answers: ['Готово', ' '] }, status: 200 },
      { method: 'GET', path: `/api/projects/${pid}/dependency-dictionary`, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/dependency-dictionary`, body: { name: 'DEP_B' }, status: 201 },
      { method: 'GET', path: `/api/dependency-dictionary/${dep.id}`, status: 200 },
      { method: 'PUT', path: `/api/dependency-dictionary/${dep.id}`, body: { name: 'DEP_A', values: ['дом', 'улица'] }, status: 200 },
      { method: 'GET', path: `/api/projects/${pid}/keywords`, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/keywords`, body: { name: '$OFF' }, status: 201 },
      { method: 'GET', path: `/api/keywords/${kw.id}`, status: 200 },
      { method: 'PUT', path: `/api/keywords/${kw.id}`, body: { name: 'ON', synonyms: ['включи'] }, status: 200 },
      { method: 'GET', path: `/api/projects/${pid}/keywords/export`, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/keywords/import`, body: { text: 'ON: включи, зажги\nNEW: новое\n' }, status: 200 },
      { method: 'GET', path: `/api/projects/${pid}/scenarios`, status: 200 },
      { method: 'POST', path: `/api/projects/${pid}/scenarios`, body: { name: 'SC_B' }, status: 201 },
      { method: 'GET', path: `/api/scenarios/${sc.id}`, status: 200 },
      { method: 'PUT', path: `/api/scenarios/${sc.id}`, body: { name: 'SC_A', description: 'Описание', entities: [], dependencies: [], parts: [{ name: 'Основная', steps: [{ kind: 'transition', state: 'ST_A', intent_id: intent.id, next_states: 'ST_B' }], layout: {} }] }, status: 200 },
      { method: 'GET', path: `/api/scenarios/${sc.id}/intents`, status: 200 },
      { method: 'POST', path: `/api/scenarios/${sc.id}/intents`, body: { name: 'INT_IN_SC' }, status: 201 },
      { method: 'PUT', path: `/api/scenarios/${sc2.id}/intents/${intent2.id}`, body: { is_global: true }, status: 200 },
      { method: 'DELETE', path: `/api/scenarios/${sc2.id}/intents/${intent2.id}`, status: 204 },
      { method: 'GET', path: `/api/scenarios/${sc.id}/prompts`, status: 200 },
      { method: 'POST', path: `/api/scenarios/${sc.id}/prompts`, body: { name: 'PRM_IN_SC' }, status: 201 },
      { method: 'PUT', path: `/api/scenarios/${sc2.id}/prompts/${prompt2.id}`, status: 200 },
      { method: 'DELETE', path: `/api/scenarios/${sc2.id}/prompts/${prompt2.id}`, status: 204 },
      { method: 'GET', path: `/api/scenarios/${sc.id}/history`, status: 200 },
      { method: 'PUT', path: `/api/scenarios/${sc.id}/changelog`, body: { rows: [{ task: 'T-1', author: 'А', description: 'Д' }] }, status: 200 },
      { method: 'GET', path: `/api/scenarios/${sc.id}/changelog`, status: 200 },
      { method: 'GET', path: `/api/scenarios/${sc.id}/export?format=md`, status: 200 },
      { method: 'GET', path: `/api/scenarios/${sc.id}/preview`, status: 200 },
      { method: 'GET', path: `/api/projects/${pid}/export?format=docx`, status: 200 },
      { method: 'DELETE', path: `/api/scenarios/${sc.id}/history`, status: 204 },
      { method: 'DELETE', path: `/api/scenarios/${sc2.id}`, status: 204 },
      { method: 'DELETE', path: `/api/keywords/${kw2.id}`, status: 204 },
      { method: 'DELETE', path: `/api/dependency-dictionary/${dep.id}`, status: 204 },
      { method: 'DELETE', path: `/api/prompts/${prompt2.id}`, status: 204 },
      { method: 'DELETE', path: `/api/entities/${ent.id}`, status: 204 },
      { method: 'DELETE', path: `/api/intents/${intent2.id}`, status: 204 },
      { method: 'DELETE', path: `/api/projects/${pid}`, status: 204 },
    ];

    const covered = new Set<string>();
    for (const c of calls) {
      const res = await request(app)[c.method.toLowerCase() as 'get'](c.path).send(c.body);
      expect(res.status, `${c.method} ${c.path}`).toBe(c.status);
      const template = c.path.split('?')[0].replace(/\/\d+/g, (m) => `/{x${m}}`);
      const hit = files.find((f) => {
        const op = JSON.parse(readFileSync(path.join(PATHS, f), 'utf-8')) as Record<string, Record<string, any>>;
        const [p, ops] = Object.entries(op)[0];
        const re = new RegExp('^' + p.replace(/\{\w+\}/g, '\\d+') + '$');
        return re.test(c.path.split('?')[0]) && ops[c.method.toLowerCase()] !== undefined;
      });
      expect(hit, `в контракте нет операции для ${c.method} ${c.path}`).toBeTruthy();
      covered.add(hit!);
      const op = Object.values(JSON.parse(readFileSync(path.join(PATHS, hit!), 'utf-8')))[0] as Record<string, any>;
      const spec = op[c.method.toLowerCase()];
      expect(spec.responses[String(c.status)], `${c.method} ${c.path}: статус ${c.status} не описан`).toBeDefined();
      const content = spec.responses[String(c.status)].content?.['application/json']?.schema;
      if (content?.type === 'object' && content.properties && res.body && typeof res.body === 'object') {
        for (const key of Object.keys(content.properties)) expect(res.body, `${c.method} ${c.path}: нет поля ${key}`).toHaveProperty(key);
      }
      if (content?.type === 'array' && Array.isArray(res.body) && res.body[0] && content.items?.properties) {
        for (const key of Object.keys(content.items.properties)) expect(res.body[0], `${c.method} ${c.path}: нет поля ${key}`).toHaveProperty(key);
      }
    }
    // операции контракта, для которых нет вызова выше (ожидается только вариант с несколькими статусами)
    const missing = files.filter((f) => !covered.has(f));
    expect(missing, 'операции контракта без вызова').toEqual([]);
  });

  it('ошибки соответствуют реестру openapi/app/errors', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db, 'Ошибки');
    const errDir = path.resolve(__dirname, '../../forge-wiki/openapi/app/errors');
    const reg = Object.fromEntries(readdirSync(errDir).map((f) => JSON.parse(readFileSync(path.join(errDir, f), 'utf-8'))).map((e) => [e.statusCode + e.code, e]));
    const wire = { 400: 'bad_request', 404: 'not_found', 409: 'duplicate' } as Record<number, string>;
    const bad = await request(app).post(`/api/projects/${pid}/intents`).send({ name: ' ' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe(wire[400]);
    expect(reg['400BadRequestError']).toBeDefined();
    const nf = await request(app).get('/api/intents/999999');
    expect([nf.status, nf.body.error]).toEqual([404, wire[404]]);
    expect(reg['404NotFoundError']).toBeDefined();
    await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'X' });
    const dup = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'x ' });
    expect([dup.status, dup.body.error]).toEqual([409, wire[409]]);
    expect(reg['409DuplicateError']).toBeDefined();
    const inuse = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'E' });
    const i = (await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'I' })).body.id;
    await request(app).put(`/api/intents/${i}`).send({ name: 'I', entities: [{ entity_id: inuse.body.id, required: false }] });
    const used = await request(app).delete(`/api/entities/${inuse.body.id}`);
    expect([used.status, used.body.error]).toEqual([409, 'in_use']);
    expect(reg['409InUseError']).toBeDefined();
    expect(used.body.details.intents[0].name).toBe('I');
  });
});
