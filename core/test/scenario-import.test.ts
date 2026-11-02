import { expect, it } from 'vitest';
import { openDb } from '../src/db';
import { dumpProject } from '../src/project-dump';
import { importScenario } from '../src/scenario-import';

it('imports only the selected scenario and its references into an existing project', async () => {
  const db = await openDb();
  db.exec(`INSERT INTO projects(id,name) VALUES (1,'Source'),(2,'Target');
    INSERT INTO scenarios(id,project_id,name) VALUES (1,1,'Selected'),(2,1,'Other');
    INSERT INTO scenario_parts(id,scenario_id,name) VALUES (1,1,'Part');
    INSERT INTO prompts(id,project_id,name,full_answers) VALUES (1,1,'Answer','["Hello"]'),(2,1,'Unused','[]');
    INSERT INTO scenario_prompts(scenario_id,prompt_id) VALUES (1,1);
    INSERT INTO scenario_states(part_id,scenario_id,name,prompt_id) VALUES (1,1,'Start',1);
`);
  const dump = dumpProject(db, 1);
  const result = importScenario(db, 2, dump, 1);
  expect(result.name).toBe('Selected');
  expect(db.prepare('SELECT name FROM scenarios WHERE project_id = 2').all()).toEqual([{ name: 'Selected' }]);
  expect(db.prepare('SELECT name FROM prompts WHERE project_id = 2').all()).toEqual([{ name: 'Answer' }]);
  const prompt = db.prepare('SELECT id FROM prompts WHERE project_id = 2').get();
  expect(db.prepare('SELECT prompt_id FROM scenario_states WHERE scenario_id = ?').get(result.id).prompt_id).toBe(prompt.id);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(db.prepare('SELECT id FROM projects').all()).toHaveLength(2);
  expect(() => importScenario(db, 2, dump, 1)).toThrow('уже есть запись');
  expect(db.prepare('SELECT id FROM scenarios WHERE project_id = 2').all()).toHaveLength(1);
});

it('rolls back all inserted data when the file has an invalid table column', async () => {
  const db = await openDb();
  db.exec("INSERT INTO projects(id,name) VALUES (1,'P'); INSERT INTO scenarios(id,project_id,name) VALUES (1,1,'S')");
  const dump = dumpProject(db, 1);
  dump.tables.scenarios[0].invalid_column = 'bad';
  expect(() => importScenario(db, 1, dump, 1)).toThrow('Неизвестное поле');
  expect(db.prepare('SELECT id FROM scenarios').all()).toHaveLength(1);
  expect(() => importScenario(db, 1, dump, 999)).toThrow('не найден');
});

it('remaps keyword and entity IDs in imported transition conditions', async () => {
  const db = await openDb();
  db.exec(`INSERT INTO projects(id,name) VALUES (1,'Source'),(2,'Target');
    INSERT INTO scenarios(id,project_id,name) VALUES (1,1,'S');
    INSERT INTO scenario_parts(id,scenario_id,name) VALUES (1,1,'Part');
    INSERT INTO keywords(id,project_id,name) VALUES (1,1,'KEY');
    INSERT INTO entities(id,project_id,name) VALUES (1,1,'ENTITY');
    INSERT INTO scenario_steps(scenario_id,part_id,conditions) VALUES (1,1,'[{"keyword_id":1,"op":"=","value":"","dep":""},{"entity_id":1,"op":"=","value":"yes","dep":""}]');`);
  const imported = importScenario(db, 2, dumpProject(db, 1), 1);
  const conditions = JSON.parse(db.prepare('SELECT conditions FROM scenario_steps WHERE scenario_id = ?').get(imported.id).conditions);
  expect(conditions[0].keyword_id).toBe(db.prepare('SELECT id FROM keywords WHERE project_id = 2').get().id);
  expect(conditions[1].entity_id).toBe(db.prepare('SELECT id FROM entities WHERE project_id = 2').get().id);
  expect(conditions[0].keyword_id).not.toBe(1);
});
