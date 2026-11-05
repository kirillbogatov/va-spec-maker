import { expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { dumpProject, importProject } from '../src/project-dump';
import { loadProjectSpec } from '../src/export/model';

async function setup() {
  const db = await openDb();
  db.exec("INSERT INTO projects(id,name) VALUES (1,'P'),(2,'Other')");
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown, status = 200) => {
    const r = await app.handle({ method, url, body });
    expect(r.status, JSON.stringify(r.body)).toBe(status);
    return r.body as any;
  };
  return { db, call };
}

it('creates independent prompts from response templates, preserving edited answers and rejecting foreign templates', async () => {
  const { db, call } = await setup();
  const template = await call('POST', '/projects/1/response-templates', { name: 'PRM_T', full_answers: ['Full', 'Alternative'], short_answers: ['Short'] }, 201);
  await call('POST', '/projects/1/response-templates', { name: ' prm_t ' }, 409);
  const s = await call('POST', '/projects/1/scenarios', { name: 'S' }, 201);
  await call('POST', `/scenarios/${s.id}/prompts`, { name: '', template_id: template.id }, 400);
  const p = await call('POST', `/scenarios/${s.id}/prompts`, { name: 'PRM_NEW', template_id: template.id }, 201);
  expect(await call('GET', `/prompts/${p.id}`)).toMatchObject({ full_answers: ['Full', 'Alternative'], short_answers: ['Short'] });
  await call('PUT', `/prompts/${p.id}`, { name: 'PRM_NEW', full_answers: ['Edited'], short_answers: [] });
  expect(await call('GET', `/response-templates/${template.id}`)).toMatchObject({ full_answers: ['Full', 'Alternative'], short_answers: ['Short'] });
  const edited = await call('POST', `/scenarios/${s.id}/prompts`, { name: 'PRM_EDIT', template_id: template.id, full_answers: ['Draft'], short_answers: [] }, 201);
  expect(await call('GET', `/prompts/${edited.id}`)).toMatchObject({ full_answers: ['Draft'], short_answers: [] });
  const other = await call('POST', '/projects/2/scenarios', { name: 'Other' }, 201);
  await call('POST', `/scenarios/${other.id}/prompts`, { name: 'Foreign', template_id: template.id }, 404);
  await call('DELETE', `/response-templates/${template.id}`, undefined, 204);
  expect(await call('GET', `/prompts/${p.id}`)).toMatchObject({ full_answers: ['Edited'] });
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('copies all scenario data and editable dictionaries through scenario → template → template → scenario', async () => {
  const { db, call } = await setup();
  db.exec(`INSERT INTO scenarios(id,project_id,name,description) VALUES (1,1,'Source','Description');
    INSERT INTO scenario_parts(id,scenario_id,position,name,description,layout,preconditions,precondition,precond_mode) VALUES (1,1,0,'Part','Part description','{"Start":{"x":12,"y":34,"order":1}}','[{"dep":"D","value":"yes"}]','Free text','any');
    INSERT INTO intents(id,project_id,name) VALUES (1,1,'INT_A');
    INSERT INTO intent_phrases(intent_id,text) VALUES (1,'Hello');
    INSERT INTO intent_patterns(intent_id,text) VALUES (1,'Pattern');
    INSERT INTO entities(id,project_id,name) VALUES (1,1,'Entity');
    INSERT INTO intent_entities(intent_id,entity_id,required) VALUES (1,1,1);
    INSERT INTO prompts(id,project_id,name,full_answers,short_answers) VALUES (1,1,'PRM_A','["Answer"]','["Short"]');
    INSERT INTO scenario_intents(scenario_id,intent_id,is_global) VALUES (1,1,0);
    INSERT INTO scenario_prompts(scenario_id,prompt_id) VALUES (1,1);
    INSERT INTO scenario_entities(scenario_id,entity_id,followup_prompt,required,is_array) VALUES (1,1,'Question',1,1);
    INSERT INTO scenario_dependencies(scenario_id,ref,name,type,options) VALUES (1,'D','Dependency','enum','["yes"]');
    INSERT INTO scenario_states(scenario_id,part_id,name,description,prompt_id,system_action) VALUES (1,1,'Start','State description',1,'Action');
    INSERT INTO scenario_steps(scenario_id,part_id,kind,state,intent_id,conditions,next_states) VALUES (1,1,'transition','Start',1,'[{"dep":"D","value":"yes","op":"="}]','End');
    INSERT INTO scenario_changelog(scenario_id,date,task,author,description) VALUES (1,'2026-11-05','Task','Author','Change');`);
  const t = await call('POST', '/projects/1/scenario-templates', { name: 'TEMP_A', source_id: 1 }, 201);
  const t2 = await call('POST', '/projects/1/scenario-templates', { name: 'TEMP_B', source_id: t.id }, 201);
  const c = await call('POST', '/projects/1/scenarios', { name: 'Copy', template_id: t2.id }, 201);
  const copy = await call('GET', `/scenarios/${c.id}`);
  expect(copy).toMatchObject({ name: 'Copy', description: 'Description', is_template: false,
    entities: [{ entity_id: 1, followup_prompt: 'Question', required: true, is_array: true }],
    dependencies: [{ ref: 'D', options: ['yes'] }],
    parts: [{ name: 'Part', description: 'Part description', precondition: 'Free text', precond_mode: 'any', preconditions: [{ dep: 'D', value: 'yes' }],
      layout: { Start: { x: 12, y: 34, order: 1, description: 'State description', system_action: 'Action' } } }] });
  const prompts = await call('GET', `/scenarios/${c.id}/prompts`);
  const intents = await call('GET', `/scenarios/${c.id}/intents`);
  expect(prompts[0].id).not.toBe(1);
  expect(intents[0]).toMatchObject({ is_global: false });
  expect(copy.parts[0].layout.Start.prompt_id).toBe(prompts[0].id);
  expect(copy.parts[0].steps[0].intent_id).toBe(intents[0].id);
  expect(await call('GET', `/intents/${intents[0].id}`)).toMatchObject({ phrases: ['Hello'], patterns: ['Pattern'], entities: [{ entity_id: 1, required: true }] });
  expect(await call('GET', `/scenarios/${c.id}/changelog`)).toMatchObject([{ date: '2026-11-05', task: 'Task', author: 'Author', description: 'Change' }]);
  await call('PUT', `/prompts/${prompts[0].id}`, { name: prompts[0].name, full_answers: ['Modified'], short_answers: [] });
  const tPrompts = await call('GET', `/scenarios/${t2.id}/prompts`);
  expect(await call('GET', `/prompts/${tPrompts[0].id}`)).toMatchObject({ full_answers: ['Answer'], short_answers: ['Short'] });
  expect((await call('GET', '/projects/1/scenarios')).map((s: any) => s.id)).toEqual([1, c.id]);
  expect((await call('GET', '/projects/1/scenario-templates')).map((s: any) => s.id)).toEqual([t.id, t2.id]);
  expect((await call('GET', '/projects'))[0].scenario_count).toBe(0); // Other project first.
  expect(loadProjectSpec(db, 1).parts.map(p => p.scenario)).toEqual(['Source', 'Copy']);
  const before = db.prepare('SELECT COUNT(*) AS n FROM scenarios').get();
  await call('POST', '/projects/2/scenario-templates', { name: 'Foreign', source_id: 1 }, 404);
  await call('POST', '/projects/1/scenarios', { name: 'Not template', template_id: 1 }, 404);
  expect(db.prepare('SELECT COUNT(*) AS n FROM scenarios').get()).toEqual(before);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('keeps templates in project backups and initializes template support on existing databases', async () => {
  let { db, call } = await setup();
  await call('POST', '/projects/1/response-templates', { name: 'Response', full_answers: ['Full'], short_answers: ['Short'] }, 201);
  await call('POST', '/projects/1/scenario-templates', { name: 'TEMP_Empty' }, 201);
  const dump = dumpProject(db, 1);
  const pid = importProject(db, dump);
  expect(db.prepare('SELECT name, is_template FROM scenarios WHERE project_id = ?').all(pid)).toEqual([{ name: 'TEMP_Empty', is_template: 1 }]);
  expect(db.prepare('SELECT name, full_answers FROM response_templates WHERE project_id = ?').all(pid)).toEqual([{ name: 'Response', full_answers: '["Full"]' }]);
  db.exec('DROP TABLE response_templates; ALTER TABLE scenarios DROP COLUMN is_template; ALTER TABLE prompts DROP COLUMN short_answers; PRAGMA user_version = 100');
  db = await openDb({ data: db.serialize() });
  expect(db.prepare('SELECT is_template FROM scenarios').all()).toEqual([{ is_template: 0 }, { is_template: 0 }]);
  expect(db.prepare('SELECT * FROM response_templates').all()).toEqual([]);
  expect((db.prepare('PRAGMA table_info(prompts)').all() as { name: string }[]).some(c => c.name === 'short_answers')).toBe(true);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
