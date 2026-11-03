import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await app.handle({ method, url, body });
    return response as { status: number; body: any };
  };
  const { body: { id: pid } } = await call('POST', '/api/projects', { name: 'Project' });
  const scenario = async (name: string) => (await call('POST', `/api/projects/${pid}/scenarios`, { name })).body.id as number;
  const save = async (sid: number, dependencies: unknown[]) => {
    const current = (await call('GET', `/api/scenarios/${sid}`)).body;
    const result = await call('PUT', `/api/scenarios/${sid}`, { ...current, dependencies });
    expect(result.status).toBe(200);
    return result.body;
  };
  return { db, app, call, pid, scenario, save };
}

describe('связь внешних зависимостей со справочником', () => {
  it('переименовывает значения во всех связанных условиях, сохраняя чужие условия и части', async () => {
    const { db, call, pid, scenario, save } = await setup();
    const dictionary = (await call('POST', `/api/projects/${pid}/dependency-dictionary`, { name: 'DEP_SHARED' })).body;
    await call('PUT', `/api/dependency-dictionary/${dictionary.id}`, { name: 'DEP_SHARED', values: ['A', 'B'] });
    const ids = [await scenario('One'), await scenario('Two')];
    for (const sid of ids) {
      await save(sid, [{ ref: 'linked', name: 'DEP_SHARED' }, { ref: 'other', name: 'DEP_OTHER', type: 'enum', options: ['A'] }]);
      for (const position of [1, 2]) {
        const part = db.prepare('INSERT INTO scenario_parts(scenario_id, position, name) VALUES (?, ?, ?)').run(sid, position, `Part ${position}`).lastInsertRowid;
        const conditions = [{ dep: 'linked', value: 'A', op: '!=' }, { dep: 'linked', value: 'B' }, { dep: 'other', value: 'A' }, { dep: 'linked', entity_id: 999, value: 'A' }, { dep: 'linked', concept_id: 999, value: 'A' }];
        db.prepare('INSERT INTO scenario_steps(scenario_id, part_id, position, conditions) VALUES (?, ?, 0, ?)').run(sid, part, JSON.stringify(conditions));
      }
    }
    const result = await call('PUT', `/api/dependency-dictionary/${dictionary.id}`, {
      name: 'DEP_SHARED', values: ['Renamed', 'B'], value_renames: [{ from: 'A', to: 'Intermediate' }, { from: 'Intermediate', to: 'Renamed' }],
    });
    expect(result.status).toBe(200);
    for (const sid of ids) {
      const current = (await call('GET', `/api/scenarios/${sid}`)).body;
      expect(current.dependencies[0].options).toEqual(['Renamed', 'B']);
      for (const part of current.parts.filter((p: any) => p.steps.length)) {
        expect(part.steps[0].conditions).toEqual([{ dep: 'linked', value: 'Renamed', op: '!=' }, { dep: 'linked', value: 'B' }, { dep: 'other', value: 'A' }, { dep: 'linked', entity_id: 999, value: 'A' }, { dep: 'linked', concept_id: 999, value: 'A' }]);
      }
      expect((await call('GET', `/api/scenarios/${sid}/preview`)).body).toContain('Renamed');
    }
    // Ошибка входных данных не должна частично менять справочник или условия.
    expect((await call('PUT', `/api/dependency-dictionary/${dictionary.id}`, { name: 'Changed', values: ['Bad'], value_renames: [{ from: 'Renamed', to: '' }] })).status).toBe(400);
    expect((await call('GET', `/api/dependency-dictionary/${dictionary.id}`)).body.values).toEqual(['Renamed', 'B']);
  });

  it('создаёт запись из сценария, сохраняет право редактирования и передаёт правки подключённым сценариям', async () => {
    const { call, pid, scenario, save } = await setup();
    const owner = await scenario('Owner');
    const first = await save(owner, [{ ref: 'local', name: 'DEP_LOCAL', type: 'enum', options: ['A', 'B'], description: 'Описание' }]);
    const dependency = first.dependencies[0];
    expect(dependency).toMatchObject({ editable: true, dictionary_id: expect.any(Number) });
    expect((await call('GET', `/api/projects/${pid}/dependency-dictionary`)).body).toHaveLength(1);
    const other = await scenario('Other');
    const connected = await save(other, [{ ...dependency, ref: 'linked', editable: true, options: ['forged'], description: 'forged' }]);
    expect(connected.dependencies[0]).toMatchObject({ editable: false, options: ['A', 'B'], description: 'Описание' });
    const updated = await save(owner, [{ ...dependency, name: 'DEP_RENAMED', options: ['C'], description: 'Новое' }]);
    expect(updated.dependencies[0]).toMatchObject({ editable: true, dictionary_id: dependency.dictionary_id });
    const dictionary = (await call('GET', `/api/dependency-dictionary/${dependency.dictionary_id}`)).body;
    expect(dictionary).toMatchObject({ name: 'DEP_RENAMED', values: ['C'], description: 'Новое' });
    expect(dictionary.used_by).toHaveLength(2);
    const inherited = (await call('GET', `/api/scenarios/${other}`)).body.dependencies[0];
    expect(inherited).toMatchObject({ editable: false, name: 'DEP_RENAMED', options: ['C'], description: 'Новое' });
    await save(other, [{ ...inherited, editable: true, options: ['forged'], description: 'forged' }]);
    expect((await call('GET', `/api/dependency-dictionary/${dependency.dictionary_id}`)).body.values).toEqual(['C']);
  });

  it('изменения справочника обновляют значения и описание сценария и его экспорт', async () => {
    const { call, pid, scenario, save } = await setup();
    const dictionary = (await call('POST', `/api/projects/${pid}/dependency-dictionary`, { name: 'DEP_SHARED' })).body;
    await call('PUT', `/api/dependency-dictionary/${dictionary.id}`, { name: 'DEP_SHARED', values: ['A'], description: 'Первое' });
    const sid = await scenario('Scenario');
    const saved = await save(sid, [{ ref: 'shared', name: 'DEP_SHARED', type: 'enum', options: [], description: '' }]);
    expect(saved.dependencies[0]).toMatchObject({ dictionary_id: dictionary.id, editable: false, options: ['A'], description: 'Первое' });
    await call('PUT', `/api/dependency-dictionary/${dictionary.id}`, { name: 'DEP_NEW_NAME', values: ['B', 'C'], description: 'Изменено в справочнике' });
    const current = (await call('GET', `/api/scenarios/${sid}`)).body.dependencies[0];
    expect(current).toMatchObject({ dictionary_id: dictionary.id, editable: false, name: 'DEP_NEW_NAME', options: ['B', 'C'], description: 'Изменено в справочнике' });
    expect((await call('GET', `/api/scenarios/${sid}/preview`)).body).toContain('Изменено в справочнике');
  });

  it('повторные сохранения до получения ID и переименование не создают лишних записей', async () => {
    const { call, pid, scenario, save } = await setup();
    const sid = await scenario('Scenario');
    const d = { ref: 'stable', name: 'DEP_A', type: 'enum', options: ['A'], description: '' };
    await save(sid, [d]);
    await save(sid, [{ ...d, name: 'DEP_B', description: 'Changed' }]);
    await save(sid, [{ ...d, name: 'DEP_B', options: ['B'] }]);
    const records = (await call('GET', `/api/projects/${pid}/dependency-dictionary`)).body;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'DEP_B', values: ['B'] });
  });

  it('проверяет принадлежность справочника проекту и откатывает изменения при ошибке', async () => {
    const { call, pid, scenario } = await setup();
    const foreign = (await call('POST', '/api/projects', { name: 'Foreign' })).body.id;
    const record = (await call('POST', `/api/projects/${foreign}/dependency-dictionary`, { name: 'DEP_FOREIGN' })).body;
    const sid = await scenario('Scenario');
    const current = (await call('GET', `/api/scenarios/${sid}`)).body;
    const result = await call('PUT', `/api/scenarios/${sid}`, { ...current, dependencies: [
      { ref: 'new', name: 'DEP_NEW', type: 'enum', options: [] },
      { ref: 'foreign', name: 'DEP_FOREIGN', dictionary_id: record.id },
    ] });
    expect(result.status).toBe(400);
    expect((await call('GET', `/api/projects/${pid}/dependency-dictionary`)).body).toEqual([]);
  });

  it('сохраняет ссылки при копировании проекта и связывает старые базы по имени', async () => {
    const { db, call, pid, scenario, save } = await setup();
    const sid = await scenario('Owner');
    const d = (await save(sid, [{ ref: 'local', name: 'DEP_LOCAL', type: 'enum', options: ['A'] }])).dependencies[0];
    const copy = (await call('POST', `/api/projects/${pid}/duplicate`, {})).body.id;
    const copySid = (await call('GET', `/api/projects/${copy}/scenarios`)).body[0].id;
    const copyDependency = (await call('GET', `/api/scenarios/${copySid}`)).body.dependencies[0];
    expect(copyDependency.dictionary_id).not.toBe(d.dictionary_id);
    expect(copyDependency.editable).toBe(true);
    db.exec('ALTER TABLE scenario_dependencies DROP COLUMN dictionary_id');
    db.exec('ALTER TABLE scenario_dependencies DROP COLUMN editable');
    const reopened = await openDb({ data: db.serialize() });
    const legacy = reopened.prepare('SELECT dictionary_id, editable FROM scenario_dependencies WHERE scenario_id = ?').get(sid);
    expect(legacy).toEqual({ dictionary_id: d.dictionary_id, editable: 0 });
  });
});
