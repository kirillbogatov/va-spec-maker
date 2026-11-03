import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb, migrate } from '../src/db';
import { loadScenarioDoc } from '../src/export/model';
import { convertScenarioDocument } from '../src/document-import';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await app.handle({ method, url, body });
    expect(response.status).toBeLessThan(400);
    return response.body as any;
  };
  const { id: pid } = await call('POST', '/api/projects', { name: 'Project' });
  const { id: sid } = await call('POST', `/api/projects/${pid}/scenarios`, { name: 'Scenario' });
  const saveDependencies = async (dependencies: unknown[]) => {
    const scenario = await call('GET', `/api/scenarios/${sid}`);
    return call('PUT', `/api/scenarios/${sid}`, { ...scenario, dependencies });
  };
  return { db, call, pid, sid, saveDependencies };
}

async function xml(body: Blob) {
  const zip = await JSZip.loadAsync(await body.arrayBuffer());
  return zip.file('word/document.xml')!.async('string');
}

describe('разделы сущностей и внешних зависимостей в спецификации', () => {
  it.each(['ru', 'en'])('не экспортирует пустые разделы (%s), даже если в проекте есть чужая сущность', async (lang) => {
    const { call, pid, sid } = await setup();
    await call('POST', `/api/projects/${pid}/entities`, { name: 'UNUSED_ENTITY' });
    for (const route of ['preview', 'export?format=md']) {
      const md = await call('GET', `/api/scenarios/${sid}/${route}${route.includes('?') ? '&' : '?'}lang=${lang}`);
      expect(md).not.toMatch(/^## (Сущности|Entities|Внешние зависимости|External dependencies)$/m);
      expect(md).not.toContain('UNUSED_ENTITY');
    }
    const document = await xml(await call('GET', `/api/scenarios/${sid}/export?format=docx&lang=${lang}`));
    expect(document).not.toMatch(/>(Сущность|Entity|Внешние зависимости|External dependencies)<\/w:t>/);
  });

  it.each(['ru', 'en'])('экспортирует зависимости таблицей из трёх колонок, с описанием и значениями (%s)', async (lang) => {
    const { call, sid, saveDependencies } = await setup();
    await saveDependencies([
      { ref: 'zone', name: 'DEP_ZONE', description: 'Источник | настроек\nВторая строка', type: 'enum', options: ['front', 'rear'] },
      { ref: 'ready', name: 'DEP_READY', description: 'Готовность', type: 'bool', options: [] },
    ]);
    const md = await call('GET', `/api/scenarios/${sid}/export?format=md&lang=${lang}`);
    expect(md).toContain(lang === 'ru' ? '| Зависимость | Значения | Описание |' : '| Dependency | Values | Description |');
    expect(md).toContain('Источник \\| настроек<br>Вторая строка');
    expect(md).toContain('front');
    expect(md).toContain('rear');
    expect(md).toContain('true');
    expect(md).toContain('false');
    expect(md).not.toMatch(/^## (Сущности|Entities)$/m);
    const document = await xml(await call('GET', `/api/scenarios/${sid}/export?format=docx&lang=${lang}`));
    const start = document.indexOf(lang === 'ru' ? 'Внешние зависимости' : 'External dependencies');
    expect(start).toBeGreaterThan(0);
    const table = document.slice(document.indexOf('<w:tbl>', start), document.indexOf('</w:tbl>', start));
    const header = table.match(/<w:tr\b[\s\S]*?<\/w:tr>/)![0];
    expect(header.match(/<w:tc>/g)).toHaveLength(3);
    expect(table).toContain('DEP_ZONE');
    expect(table).toContain('Вторая строка');
    expect(table).toContain('front');
    expect(table).toContain('true');
  });

  it('учитывает сущности условий второй вкладки и сущности сценария', async () => {
    const { db, call, pid, sid } = await setup();
    const { id: conditionEntity } = await call('POST', `/api/projects/${pid}/entities`, { name: 'ENT_SECOND_PART' });
    const { id: scenarioEntity } = await call('POST', `/api/projects/${pid}/entities`, { name: 'ENT_SCENARIO' });
    const part = db.prepare('INSERT INTO scenario_parts(scenario_id,name,position) VALUES (?,?,1)').run(sid, 'Second').lastInsertRowid;
    db.prepare('INSERT INTO scenario_steps(scenario_id,part_id,conditions) VALUES (?,?,?)').run(sid, part, JSON.stringify([{ entity_id: conditionEntity, value: 'yes' }]));
    db.prepare('INSERT INTO scenario_entities(scenario_id,entity_id) VALUES (?,?)').run(sid, scenarioEntity);
    expect(loadScenarioDoc(db, sid).spec.entities.map((e) => e.name)).toEqual(['ENT_SECOND_PART', 'ENT_SCENARIO']);
    const md = await call('GET', `/api/scenarios/${sid}/export?format=md`);
    expect(md).toContain('## Сущности');
    expect(md).toContain('[ENT_SECOND_PART]');
    expect(md).toContain('| ENT_SCENARIO |');
  });

  it('сохраняет описание в API, копии проекта и повторном импорте спецификации', async () => {
    const { call, pid, sid, saveDependencies } = await setup();
    const dictionary = await call('POST', `/api/projects/${pid}/dependency-dictionary`, { name: 'DEP_SOURCE' });
    await call('PUT', `/api/dependency-dictionary/${dictionary.id}`, { name: 'DEP_SOURCE', description: 'Из справочника', values: ['A', 'B'] });
    expect((await call('GET', `/api/projects/${pid}/dependency-dictionary`))[0].description).toBe('Из справочника');
    await saveDependencies([{ ref: 'source', name: 'DEP_SOURCE', description: 'Описание сценария', type: 'enum', options: ['A', 'B'] }]);
    expect((await call('GET', `/api/scenarios/${sid}`)).dependencies[0].description).toBe('Из справочника');
    const copy = await call('POST', `/api/projects/${pid}/duplicate`, {});
    const copiedScenarios = await call('GET', `/api/projects/${copy.id}/scenarios`);
    expect((await call('GET', `/api/scenarios/${copiedScenarios[0].id}`)).dependencies[0].description).toBe('Из справочника');
    expect((await call('GET', `/api/projects/${copy.id}/dependency-dictionary`))[0].description).toBe('Из справочника');
    for (const lang of ['ru', 'en']) {
      const md = await call('GET', `/api/scenarios/${sid}/export?format=md&lang=${lang}`);
      const imported = await convertScenarioDocument(md, 'spec.md');
      expect(imported.dump.tables.scenario_dependencies[0]).toMatchObject({ name: 'DEP_SOURCE', description: 'Из справочника', options: '["A","B"]' });
    }
  });

  it('добавляет поле описания в старую базу без потери зависимостей', async () => {
    const { db, sid, saveDependencies } = await setup();
    await saveDependencies([{ ref: 'old', name: 'DEP_OLD', type: 'enum', options: ['A'] }]);
    db.exec('ALTER TABLE scenario_dependencies DROP COLUMN description');
    migrate(db);
    migrate(db);
    expect(db.prepare('SELECT name, description, options FROM scenario_dependencies WHERE scenario_id = ?').get(sid)).toEqual({ name: 'DEP_OLD', description: '', options: '["A"]' });
  });
});
