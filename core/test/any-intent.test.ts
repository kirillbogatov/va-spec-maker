import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { migrate, openDb } from '../src/db';
import { dumpProject, importProject } from '../src/project-dump';
import { importScenario } from '../src/scenario-import';
import { convertScenarioDocument } from '../src/document-import';
import { loadProjectSpec } from '../src/export/model';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown): Promise<any> => {
    const response = await app.handle({ method, url, body });
    expect(response.status, `${method} ${url}`).toBeLessThan(400);
    return response.body;
  };
  const pid = (await call('POST', '/api/projects', { name: 'Wildcard project' })).id;
  const sid = (await call('POST', `/api/projects/${pid}/scenarios`, { name: 'Wildcard scenario' })).id;
  const rows = [
    { state: 'ANY', next_states: 'DONE', intent_id: 987654, match_any_intent: true },
    { state: 'NONE', next_states: 'DONE', intent_id: null },
    { state: 'ERROR', next_states: 'DONE', kind: 'error', intent_id: null },
  ];
  const save = (steps: unknown[]) => call('PUT', `/api/scenarios/${sid}`, { name: 'Wildcard scenario', parts: [{ name: 'Main', steps }] });
  await save(rows);
  return { app, db, call, pid, sid, rows, save };
}

it('roundtrips explicit wildcard, preserves legacy null semantics and rejects non-boolean API flags', async () => {
  const { app, db, call, sid } = await setup();
  const scenario = await call('GET', `/api/scenarios/${sid}`);
  expect(scenario.parts[0].steps.map((s: any) => [s.kind, s.intent_id, s.match_any_intent])).toEqual([
    ['transition', null, true], ['transition', null, false],
  ]);
  expect(db.prepare('SELECT match_any_intent FROM scenario_steps ORDER BY position').all()).toEqual([
    { match_any_intent: 1 }, { match_any_intent: 0 },
  ]);
  expect((await app.handle({ method: 'PUT', url: `/api/scenarios/${sid}`, body: { ...scenario, parts: [{ name: 'Main', steps: [{ match_any_intent: 'true' }] }] } })).status).toBe(400);
  const reopened = createApp(await openDb({ data: db.serialize() }));
  const loaded = await reopened.handle({ method: 'GET', url: `/api/scenarios/${sid}` });
  expect((loaded.body as any).parts[0].steps[0].match_any_intent).toBe(true);
});

it.each(['ru', 'en'] as const)('exports %s wildcard distinctly in Markdown, DOCX, preview and document import', async lang => {
  const { db, call, pid, sid } = await setup();
  const label = lang === 'ru' ? 'Любой интент' : 'Any intent';
  const scenarioLabel = lang === 'ru' ? 'Любой интент сценария' : 'Any scenario intent';
  const spec = loadProjectSpec(db, pid, lang);
  expect(spec.transitions.find(s => s.state === 'ANY')?.intent).toBe(label);
  expect(spec.transitions.find(s => s.state === 'NONE')?.intent).toBeNull();
  expect(spec).not.toHaveProperty('errors');
  const md = await call('GET', `/api/scenarios/${sid}/export?format=md&lang=${lang}`);
  expect(md).toContain(label);
  expect(md).not.toContain(scenarioLabel);
  expect(await call('GET', `/api/scenarios/${sid}/preview?lang=${lang}`)).toContain(label);
  const docx: Blob = await call('GET', `/api/scenarios/${sid}/export?format=docx&lang=${lang}`);
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const plain = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
  expect(plain).toContain(label);
  expect(plain).not.toContain(scenarioLabel);
  const imported = await convertScenarioDocument(md, 'wildcard.md');
  expect(imported.dump.tables.intents).toHaveLength(0);
  expect(imported.dump.tables.scenario_steps.find(s => s.state === 'ANY')).toMatchObject({ intent_id: null, match_any_intent: 1, kind: 'transition' });
  expect(imported.dump.tables.scenario_steps.find(s => s.state === 'NONE')).toMatchObject({ intent_id: null, match_any_intent: 0 });
  expect(imported.dump.tables.scenario_steps.find(s => s.state === 'ERROR')).toBeUndefined();
});

it('preserves wildcard through project import, duplicate, scenario import and accepts boolean dump flags', async () => {
  const { db, call, pid, sid } = await setup();
  const dump = dumpProject(db, pid);
  const check = (projectId: number) => {
    const steps = db.prepare('SELECT kind, intent_id, match_any_intent FROM scenario_steps WHERE scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?) ORDER BY position').all(projectId);
    expect(steps.map(s => [s.kind, s.intent_id, s.match_any_intent])).toEqual([
      ['transition', null, 1], ['transition', null, 0],
    ]);
  };
  check(importProject(db, dump));
  check((await call('POST', `/api/projects/${pid}/duplicate`)).id);
  const target = (await call('POST', '/api/projects', { name: 'Scenario target' })).id;
  importScenario(db, target, dump, sid);
  check(target);
  const booleanDump = structuredClone(dump);
  booleanDump.tables.scenario_steps[0].match_any_intent = true;
  booleanDump.tables.scenario_steps[0].intent_id = 999999;
  check(importProject(db, booleanDump));
  const legacy = structuredClone(dump);
  for (const step of legacy.tables.scenario_steps) delete step.match_any_intent;
  const legacyPid = importProject(db, legacy);
  expect(db.prepare('SELECT match_any_intent FROM scenario_steps WHERE scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?)').all(legacyPid).every(s => s.match_any_intent === 0)).toBe(true);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('migrates the actual schema even for a newer edition version and preserves legacy any_intent conversion', async () => {
  const { db } = await setup();
  db.exec('ALTER TABLE scenario_steps DROP COLUMN match_any_intent; PRAGMA user_version = 999');
  migrate(db);
  expect(db.prepare('SELECT match_any_intent FROM scenario_steps').all().every(s => s.match_any_intent === 0)).toBe(true);
  db.exec('ALTER TABLE scenario_steps ADD COLUMN any_intent INTEGER NOT NULL DEFAULT 0; UPDATE scenario_steps SET any_intent = 1 WHERE state = \'ANY\'; PRAGMA user_version = 0');
  migrate(db);
  expect(db.prepare('SELECT kind, intent_id, match_any_intent, any_intent FROM scenario_steps WHERE state = ?').get('ANY')).toEqual({ kind: 'error', intent_id: null, match_any_intent: 0, any_intent: 0 });
});

it('records a wildcard-only history change and does not log a repeated unchanged save', async () => {
  const { db, call, sid, save } = await setup();
  const before = await call('GET', `/api/scenarios/${sid}`);
  before.parts[0].steps[0].match_any_intent = false;
  await save(before.parts[0].steps);
  db.prepare('DELETE FROM scenario_history WHERE scenario_id = ?').run(sid);
  before.parts[0].steps[0].match_any_intent = true;
  await save(before.parts[0].steps);
  const history = await call('GET', `/api/scenarios/${sid}/history`);
  expect(history.some((h: any) => h.text.includes('Любой интент'))).toBe(true);
  await save(before.parts[0].steps);
  expect(await call('GET', `/api/scenarios/${sid}/history`)).toEqual(history);
});
