import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { loadScenarioDoc } from '../src/export/model';
import { convertScenarioDocument } from '../src/document-import';

async function setup(count: number) {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await app.handle({ method, url, body });
    expect(response.status).toBeLessThan(400);
    return response.body as any;
  };
  const { id: pid } = await call('POST', '/api/projects', { name: 'PROJECT_EXPORT' });
  const { id: sid } = await call('POST', `/api/projects/${pid}/scenarios`, { name: 'SCENARIO_EXPORT' });
  const eid = db.prepare('INSERT INTO entities(project_id,name,type) VALUES (?,?,?)').run(pid,'ENT_PRE_ONLY','number').lastInsertRowid;
  const cid = db.prepare('INSERT INTO keywords(project_id,name) VALUES (?,?)').run(pid,'CONCEPT_PRE_ONLY').lastInsertRowid;
  db.prepare('INSERT INTO scenario_dependencies(scenario_id,ref,name,type,options) VALUES (?,?,?,?,?)').run(sid,'zone','DEP_PRE_ONLY','enum','["front","rear"]');
  db.prepare('DELETE FROM scenario_parts WHERE scenario_id = ?').run(sid);
  for (let i = 0; i < count; i++) {
    const conditions = [{ dep: 'zone', op: '=', value: 'front' }, { dep: '', entity_id: eid, op: '>', value: '3' }, { dep: '', keyword_id: cid, op: '!=', value: '' }];
    const partId = db.prepare('INSERT INTO scenario_parts(scenario_id,position,name,description,preconditions,precondition,precond_mode) VALUES (?,?,?,?,?,?,?)')
      .run(sid,i,`TAB_${i}`,`TAB_DESCRIPTION_${i}`,JSON.stringify(conditions),`FREE_PRE_${i}`,i === 0 ? 'any' : 'all').lastInsertRowid;
    db.prepare('INSERT INTO scenario_steps(scenario_id,part_id,state,next_states) VALUES (?,?,?,?)').run(sid,partId,`FROM_${i}`,`TO_${i}`);
    db.prepare('INSERT INTO scenario_steps(scenario_id,part_id,state,next_states) VALUES (?,?,?,?)').run(sid,partId,`TO_${i}`,`AFTER_${i}`);
  }
  return { db, pid, sid, call };
}

const documentText = async (blob: Blob) => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
};

describe('tab properties in exported documents', () => {
  for (const lang of ['ru', 'en']) for (const count of [1, 2]) {
    it(`exports isolated properties before each transition table: ${lang}, ${count} tabs`, async () => {
      const { db, pid, sid, call } = await setup(count);
      const doc = loadScenarioDoc(db,sid,lang as 'ru' | 'en');
      expect(doc.spec.entities.map((entity) => entity.name)).toContain('ENT_PRE_ONLY');
      expect(doc.parts[0].title).toBe('TAB_0');
      for (const scope of [`scenarios/${sid}`, `projects/${pid}`]) for (const format of ['md', 'docx']) {
        const body = await call('GET',`/api/${scope}/export?format=${format}&lang=${lang}`);
        const text = format === 'md' ? body : await documentText(body);
        for (let i = 0; i < count; i++) {
          const title = text.indexOf(`TAB_${i}`);
          const description = text.indexOf(`TAB_DESCRIPTION_${i}`, title);
          const heading = text.indexOf(lang === 'ru' ? 'Предусловия' : 'Preconditions', description);
          const condition = text.indexOf(`FREE_PRE_${i}`, heading);
          const row = text.indexOf(`FROM_${i}`, condition);
          expect(title).toBeGreaterThanOrEqual(0);
          expect(description).toBeGreaterThan(title);
          expect(heading).toBeGreaterThan(description);
          expect(condition).toBeGreaterThan(heading);
          expect(row).toBeGreaterThan(condition);
          expect(text.split(`FREE_PRE_${i}`).length - 1).toBe(1);
          expect(text.slice(heading,row)).toContain('[DEP_PRE_ONLY] = front');
          expect(text.slice(heading,row)).toContain('[ENT_PRE_ONLY] > 3');
          expect(text.slice(heading,row)).toContain('CONCEPT_PRE_ONLY');
          if (i === 0) expect(text.slice(heading,row)).toContain(lang === 'ru' ? 'Любое условие (ИЛИ)' : 'Any condition (OR)');
          expect(text).not.toContain('All conditions (AND)');
          expect(text).not.toContain('Все условия (И)');
          if (i + 1 < count) expect(row).toBeLessThan(text.indexOf(`TAB_${i + 1}`));
        }
      }
      const preview = await call('GET',`/api/scenarios/${sid}/preview?lang=${lang}`);
      expect(preview.indexOf('FREE_PRE_0')).toBeLessThan(preview.indexOf('FROM_0'));
    });

    it(`round-trips tab metadata and conditions without synthetic steps: ${lang}, ${count} tabs`, async () => {
      const { sid, call } = await setup(count);
      const md = await call('GET',`/api/scenarios/${sid}/export?format=md&lang=${lang}`);
      const result = await convertScenarioDocument(md, 'roundtrip.md');
      const parts = result.dump.tables.scenario_parts;
      expect(parts).toHaveLength(count);
      expect(result.dump.tables.scenario_steps).toHaveLength(count * 2);
      for (let i = 0; i < count; i++) {
        expect(parts[i]).toMatchObject({ name: `TAB_${i}`, description: `TAB_DESCRIPTION_${i}`, precondition: `FREE_PRE_${i}`, precond_mode: i === 0 ? 'any' : 'all' });
        const conditions = JSON.parse(String(parts[i].preconditions));
        expect(conditions).toHaveLength(3);
        expect(conditions[0]).toMatchObject({ value: 'front', op: '=' });
        expect(conditions[1]).toMatchObject({ entity_id: expect.any(Number), value: '3', op: '>' });
        expect(conditions[2]).toMatchObject({ keyword_id: expect.any(Number), op: '!=' });
      }
      expect(result.dump.tables.scenarios[0].description).not.toContain('TAB_DESCRIPTION');
      expect(result.dump.tables.scenarios[0].description).not.toContain('FREE_PRE');
    });
  }

  it('does not interpret tab names as document section types', async () => {
    const { db, sid, call } = await setup(2);
    const rows = db.prepare('SELECT id FROM scenario_parts WHERE scenario_id = ? ORDER BY position,id').all(sid);
    db.prepare('UPDATE scenario_parts SET name = ?, preconditions = ?, precondition = ? WHERE id = ?').run('Errors','[]','',rows[0].id);
    db.prepare('UPDATE scenario_parts SET name = ? WHERE id = ?').run('Диаграмма',rows[1].id);
    const md = await call('GET',`/api/scenarios/${sid}/export?format=md`);
    const result = await convertScenarioDocument(md,'names.md');
    expect(result.dump.tables.scenario_parts[0]).toMatchObject({ name: 'Errors', description: 'TAB_DESCRIPTION_0' });
    expect(result.dump.tables.scenario_parts[1]).toMatchObject({ name: 'Диаграмма', description: 'TAB_DESCRIPTION_1' });
    expect(result.dump.tables.scenario_steps.every((row) => row.kind === 'transition')).toBe(true);
  });

  it('keeps defaults for a tab created without precondition properties', async () => {
    const { db, sid } = await setup(1);
    db.prepare('DELETE FROM scenario_parts WHERE scenario_id = ?').run(sid);
    db.prepare('INSERT INTO scenario_parts(scenario_id,name) VALUES (?,?)').run(sid,'LEGACY_TAB');
    expect(loadScenarioDoc(db,sid).parts[0]).toMatchObject({ title: 'LEGACY_TAB', description: '', preconditions: [], precondition: '', precond_mode: 'all' });
  });
});
