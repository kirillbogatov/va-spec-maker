import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { groupConditions } from '../src/export/conditions';

it('groups equality alternatives in order and preserves conjunctions and range comparisons', () => {
  const lines = ['[DEP] = driver', '[OTHER] = true', '[DEP] = front_passenger', '[DEP] = driver', '[DEP] > 3'];
  expect(groupConditions(lines, 'any')).toEqual(['[DEP] = driver OR front_passenger', '[OTHER] = true', '[DEP] > 3']);
  expect(groupConditions(lines, 'all')).toEqual(['[DEP] = driver AND front_passenger', '[OTHER] = true', '[DEP] > 3']);
});

it.each([1, 2])('exports %i source conditions as one item without an OR introduction', async (count) => {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown): Promise<any> => {
    const r = await app.handle({ method, url, body });
    expect(r.status).toBeLessThan(400);
    return r.body;
  };
  const pid = (await call('POST', '/api/projects', { name: 'P' })).id;
  const sid = (await call('POST', `/api/projects/${pid}/scenarios`, { name: 'S' })).id;
  const eid = (await call('POST', `/api/projects/${pid}/entities`, { name: 'ENT_POSITION' })).id;
  await call('PUT', `/api/entities/${eid}`, { name: 'ENT_POSITION', type: 'string', values: [{ value: 'driver', synonyms: ['водитель'] }, { value: 'front_passenger', synonyms: [] }] });
  const conditions = [{ dep: 'position', value: 'driver' }, { dep: 'position', value: 'front_passenger' }].slice(0, count);
  const expectedCondition = `[DEP_SPEAKER_POSITION] = driver${count === 2 ? ' OR front_passenger' : ''}`;
  await call('PUT', `/api/scenarios/${sid}`, { name: 'S', entities: [{ entity_id: eid }],
    dependencies: [{ ref: 'position', name: 'DEP_SPEAKER_POSITION', type: 'enum', options: ['driver', 'front_passenger'] }],
    parts: [{ name: 'Main', preconditions: conditions, precond_mode: 'any', steps: [
      { state: 'A', next_states: 'B', conditions, cond_mode: 'any' },
      { kind: 'error', state: 'RETIRED_ERROR' },
    ] }],
  });
  expect((await call('GET', `/api/scenarios/${sid}`)).parts[0].steps).toHaveLength(1);
  for (const lang of ['ru', 'en']) for (const scope of [`scenarios/${sid}`, `projects/${pid}`]) {
    const md = await call('GET', `/api/${scope}/export?format=md&lang=${lang}`);
    expect(md.split(expectedCondition)).toHaveLength(3);
    expect(md).not.toMatch(/Any condition \(OR\)|Любое условие \(ИЛИ\)|Any of:|Любое из:/);
    expect(md).toContain('| ENT_POSITION |');
    expect(md).toContain('1. **driver:** "водитель"<br>2. **front_passenger**');
    expect(md).not.toMatch(/^## (Ошибки|Errors)$/m);
    expect(md).not.toContain('RETIRED_ERROR');
    const blob: Blob = await call('GET', `/api/${scope}/export?format=docx&lang=${lang}`);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const plain = xml.replace(/<[^>]+>/g, '');
    expect(plain).toContain(expectedCondition);
    expect(plain).not.toMatch(/Any condition \(OR\)|Любое условие \(ИЛИ\)|Any of:|Любое из:/);
    expect(xml).not.toContain('[ENT_POSITION]');
    expect(xml).not.toContain('RETIRED_ERROR');
    const values = xml.match(/<w:p[ >][\s\S]*?<w:t[^>]*>driver:<\/w:t>[\s\S]*?<\/w:p>/)?.[0];
    expect(values).toContain('<w:numPr>');
  }
});
