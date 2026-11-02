import { expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { convertScenarioDocument } from '../src/document-import';
import { importScenario } from '../src/scenario-import';

it.each(['ru', 'en'])('imports exported %s specification tables and preserves transition references', async lang => {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown) => {
    const r = await app.handle({ method, url, body });
    expect(r.status).toBeLessThan(400);
    return r.body as any;
  };
  const project = await call('POST','/api/projects',{name:'P'});
  const scenario = await call('POST',`/api/projects/${project.id}/scenarios`,{name:'Test scenario'});
  const intent = await call('POST',`/api/scenarios/${scenario.id}/intents`,{name:'INT_TEST'});
  const prompt = await call('POST',`/api/scenarios/${scenario.id}/prompts`,{name:'PRM_TEST'});
  await call('PUT',`/api/prompts/${prompt.id}`,{name:'PRM_TEST',full_answers:['Hello','World']});
  await call('PUT',`/api/scenarios/${scenario.id}`,{name:'Test scenario',description:'Preserved description',dependencies:[],entities:[],parts:[{name:'Main',layout:{DONE:{x:1,y:2,prompt_id:prompt.id,system_action:'Do it',description:''}},steps:[{state:'START',next_states:'DONE',intent_id:intent.id,conditions:[],condition:'Only when ready'}]}]});
  const markdown = await call('GET',`/api/scenarios/${scenario.id}/export?format=md&lang=${lang}`);
  const result = await convertScenarioDocument(markdown,'test.md');
  expect(result.dump.tables.scenarios).toHaveLength(1);
  expect(result.dump.tables.prompts[0].full_answers).toBe('["Hello","World"]');
  expect(result.dump.tables.scenario_steps[0].condition).toBe('Only when ready');
  const target = await call('POST','/api/projects',{name:'Target'});
  const imported = importScenario(db,target.id,result.dump,Number(result.dump.tables.scenarios[0].id));
  const state = db.prepare('SELECT * FROM scenario_states WHERE scenario_id = ? AND name = ?').get(imported.id,'DONE');
  expect(state.system_action).toBe('Do it');
  expect(state.prompt_id).not.toBeNull();
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('keeps unstructured text and unknown tables with a visible warning', async () => {
  const result = await convertScenarioDocument('# Notes\n\nDetails\n\n| Custom | Value |\n|---|---|\n| A | B |','notes.md');
  expect(result.dump.tables.scenarios[0].description).toContain('Details');
  expect(result.dump.tables.scenarios[0].description).toContain('A | B');
  expect(result.warnings.length).toBeGreaterThan(0);
  await expect(convertScenarioDocument('', 'empty.md')).rejects.toThrow('пуст');
});
