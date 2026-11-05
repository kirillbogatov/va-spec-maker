import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { migrate, openDb } from '../src/db';
import { dumpProject, importProject } from '../src/project-dump';
import { importScenario } from '../src/scenario-import';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown): Promise<any> => {
    const response = await app.handle({ method, url, body });
    expect(response.status, `${method} ${url}: ${JSON.stringify(response.body)}`).toBeLessThan(400);
    return response.body;
  };
  const pid = (await call('POST', '/api/projects', { name: 'P' })).id;
  const sid = (await call('POST', `/api/projects/${pid}/scenarios`, { name: 'S' })).id;
  const entity = await call('POST', `/api/projects/${pid}/entities`, { name: 'ENT_TEMP' });
  const concept = await call('POST', `/api/projects/${pid}/keywords`, { name: 'CABIN' });
  const preconditions = [
    { dep: 'mode', op: '=', value: 'warm' },
    { dep: '', entity_id: entity.id, op: '>', value: '20' },
    { dep: '', keyword_id: concept.id, op: '!=', value: '' },
  ];
  const body = {
    name: 'S',
    dependencies: [{ ref: 'mode', name: 'DEP_MODE', type: 'enum', options: ['warm', 'cold'] }],
    parts: [
      { name: 'Main', description: '', preconditions, precondition: 'При заведённом двигателе', precond_mode: 'all', steps: [{ state: 'START', next_states: 'DONE', conditions: [] }] },
      { name: 'Other', steps: [{ state: 'OTHER', next_states: 'END', conditions: [] }] },
    ],
  };
  const save = (next: unknown = body) => call('PUT', `/api/scenarios/${sid}`, next);
  await save();
  return { db, app, call, pid, sid, entity, concept, body, save };
}

it.each(['all', 'any'])('roundtrips %s part preconditions without copying them into transitions or sibling parts', async mode => {
  const { db, call, sid, body, save } = await setup();
  body.parts[0].precond_mode = mode;
  await save();
  const read = async (app = createApp(db)) => (await app.handle({ method: 'GET', url: `/api/scenarios/${sid}` })).body as any;
  const scenario = await read();
  expect(scenario.parts[0]).toMatchObject({ preconditions: body.parts[0].preconditions, precondition: body.parts[0].precondition, precond_mode: mode });
  expect(scenario.parts[1]).toMatchObject({ preconditions: [], precondition: '', precond_mode: 'all' });
  expect(scenario.parts.flatMap((p: any) => p.steps).every((s: any) => s.conditions.length === 0)).toBe(true);
  expect((await read(createApp(await openDb({ data: db.serialize() }))))).toEqual(scenario);
  const renamed = await call('GET', `/api/scenarios/${sid}`);
  renamed.parts[0].name = 'Renamed';
  await save(renamed);
  expect((await read()).parts[0].preconditions).toEqual(body.parts[0].preconditions);
});

it('rejects missing/foreign typed references, missing dependencies, malformed conditions and modes', async () => {
  const { app, call, sid, body } = await setup();
  const foreignPid = (await call('POST', '/api/projects', { name: 'Foreign' })).id;
  const foreignEntity = (await call('POST', `/api/projects/${foreignPid}/entities`, { name: 'FOREIGN' })).id;
  const foreignConcept = (await call('POST', `/api/projects/${foreignPid}/keywords`, { name: 'FOREIGN' })).id;
  for (const preconditions of [[{ dep: 'absent', value: 'x' }], [{ entity_id: 99999 }], [{ entity_id: foreignEntity }], [{ keyword_id: 99999 }], [{ keyword_id: foreignConcept }], [null], {}]) {
    const invalid = structuredClone(body) as any;
    invalid.parts[0].preconditions = preconditions;
    expect((await app.handle({ method: 'PUT', url: `/api/scenarios/${sid}`, body: invalid })).status).toBe(400);
  }
  const invalid = structuredClone(body);
  invalid.parts[0].precond_mode = 'invalid';
  expect((await app.handle({ method: 'PUT', url: `/api/scenarios/${sid}`, body: invalid })).status).toBe(400);
  const missingDependency = { ...body, dependencies: [] };
  expect((await app.handle({ method: 'PUT', url: `/api/scenarios/${sid}`, body: missingDependency })).status).toBe(400);
  expect((await call('GET', `/api/scenarios/${sid}`)).parts[0].preconditions).toEqual(body.parts[0].preconditions);
});

it('preserves and remaps part-only entity/concept references through project import, duplicate and scenario import', async () => {
  const { db, call, pid, sid, body, entity, concept } = await setup();
  const dump = dumpProject(db, pid);
  const check = async (projectId: number) => {
    const scenarioId = db.prepare('SELECT id FROM scenarios WHERE project_id = ?').get(projectId).id;
    const scenario = await call('GET', `/api/scenarios/${scenarioId}`);
    const p = scenario.parts[0];
    expect(p.precondition).toBe(body.parts[0].precondition);
    expect(p.precond_mode).toBe('all');
    expect(p.preconditions[0]).toEqual(body.parts[0].preconditions![0]);
    const eid = p.preconditions[1].entity_id;
    const cid = p.preconditions[2].keyword_id;
    expect(eid).not.toBe(entity.id);
    expect(cid).not.toBe(concept.id);
    expect(db.prepare('SELECT project_id, name FROM entities WHERE id = ?').get(eid)).toEqual({ project_id: projectId, name: 'ENT_TEMP' });
    expect(db.prepare('SELECT project_id, name FROM keywords WHERE id = ?').get(cid)).toEqual({ project_id: projectId, name: 'CABIN' });
  };
  await check(importProject(db, dump));
  await check((await call('POST', `/api/projects/${pid}/duplicate`)).id);
  const target = (await call('POST', '/api/projects', { name: 'Target' })).id;
  importScenario(db, target, dump, sid);
  await check(target);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('rejects invalid imported references and malformed JSON with a full rollback', async () => {
  const { db, pid } = await setup();
  const base = dumpProject(db, pid);
  const count = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  for (const value of [JSON.stringify([{ entity_id: 99999 }]), JSON.stringify([{ keyword_id: 99999 }]), JSON.stringify([{ dep: 'absent', value: 'bad' }]), '[null]', '{bad']) {
    const dump = structuredClone(base);
    dump.tables.scenario_parts[0].preconditions = value;
    expect(() => importProject(db, dump)).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n).toBe(count);
  }
  const noIds = structuredClone(base);
  delete noIds.tables.scenario_parts[0].id;
  noIds.tables.scenario_parts[0].preconditions = JSON.stringify([{ entity_id: 99999 }]);
  expect(() => importProject(db, noIds)).toThrow();
  expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n).toBe(count);
  const dump = structuredClone(base);
  dump.tables.scenario_parts[0].precond_mode = 'invalid';
  expect(() => importProject(db, dump)).toThrow();
  expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n).toBe(count);
});

it('defaults legacy database schemas, old dumps and old payloads without touching step conditions', async () => {
  const { db, call, sid, pid, body, save } = await setup();
  for (const column of ['preconditions', 'precondition', 'precond_mode']) db.exec(`ALTER TABLE scenario_parts DROP COLUMN ${column}`);
  db.exec('PRAGMA user_version = 999');
  migrate(db);
  expect((await call('GET', `/api/scenarios/${sid}`)).parts[0]).toMatchObject({ preconditions: [], precondition: '', precond_mode: 'all' });
  await save();
  const old = dumpProject(db, pid);
  for (const p of old.tables.scenario_parts) for (const key of ['preconditions', 'precondition', 'precond_mode']) delete p[key];
  const target = importProject(db, old);
  const part = db.prepare('SELECT preconditions, precondition, precond_mode FROM scenario_parts WHERE scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?) ORDER BY position').get(target);
  expect(part).toEqual({ preconditions: '[]', precondition: '', precond_mode: 'all' });
  const oldPayload = structuredClone(body) as any;
  for (const p of oldPayload.parts) for (const key of ['preconditions', 'precondition', 'precond_mode']) delete p[key];
  await save(oldPayload);
  expect((await call('GET', `/api/scenarios/${sid}`)).parts[0]).toMatchObject({ preconditions: [], precondition: '', precond_mode: 'all' });
});

it('tracks part references, guards deletions and propagates dictionary value rename only to matching dependency conditions', async () => {
  const { db, app, call, sid, entity, concept, body, save } = await setup();
  expect((await app.handle({ method: 'DELETE', url: `/api/entities/${entity.id}?force=1` })).status).toBe(409);
  expect((await app.handle({ method: 'DELETE', url: `/api/keywords/${concept.id}` })).status).toBe(409);
  const d = db.prepare('SELECT dictionary_id FROM scenario_dependencies WHERE scenario_id = ?').get(sid).dictionary_id;
  await call('PUT', `/api/dependency-dictionary/${d}`, { name: 'DEP_RENAMED', values: ['hot', 'cold'], value_renames: [{ from: 'warm', to: 'hot' }] });
  const part = (await call('GET', `/api/scenarios/${sid}`)).parts[0];
  expect(part.preconditions[0]).toEqual({ dep: 'mode', op: '=', value: 'hot' });
  expect(part.preconditions[1]).toEqual(body.parts[0].preconditions![1]);
  await call('PUT', `/api/keywords/${concept.id}`, { name: 'RENAMED', synonyms: [] });
  expect((await call('GET', `/api/scenarios/${sid}`)).parts[0].preconditions[2].keyword_id).toBe(concept.id);
  const clear = await call('GET', `/api/scenarios/${sid}`);
  clear.parts[0].preconditions = [];
  await save(clear);
  await call('DELETE', `/api/entities/${entity.id}`);
  await call('DELETE', `/api/keywords/${concept.id}`);
});
