import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { loadProjectSpec, loadScenarioDoc } from '../src/export/model';

describe('порядок схемы в спецификации', () => {
  it('учитывает порядок источников и ветвей в каждой вкладке и во всех форматах экспорта', async () => {
    const db = await openDb();
    try {
      const app = createApp(db);
      const call = async (method: string, url: string, body?: unknown) => {
        const r = await app.handle({ method, url, body });
        expect(r.status).toBeLessThan(400);
        return r.body as any;
      };
      const pid = (await call('POST', '/api/projects', { name: 'Export order' })).id;
      const sid = (await call('POST', `/api/projects/${pid}/scenarios`, { name: 'Scenario' })).id;
      const initial = await call('GET', `/api/scenarios/${sid}`);
      const step = (state: string, target: string, condition: string) => ({
        kind: 'transition', state, next_states: target, condition, conditions: [],
        intent_id: null, request_params: '', prompt_id: null, system_action: '',
      });
      const part = (name: string, reverse: boolean, manual: boolean) => ({
        name, description: '',
        layout: Object.fromEntries(['VA_ACTIVATION', ...(reverse ? ['ST_B', 'ST_A'] : ['ST_A', 'ST_B']), 'ST_END'].map((state, order) => [state, { x: 0, y: 0, ...(manual ? { order } : {}) }])),
        steps: [
          step('VA_ACTIVATION', 'ST_A', name + '_BRANCH_A'),
          step('VA_ACTIVATION', 'ST_B', name + '_BRANCH_B'),
          step('ST_A', 'ST_END', name + '_A_FIRST'),
          step('ST_A', 'ST_END', name + '_A_SECOND'),
          step('ST_B', 'ST_END', name + '_B_FIRST'),
        ],
      });
      await call('PUT', `/api/scenarios/${sid}`, { ...initial, parts: [
        part('ONE', true, true), part('TWO', false, true), part('LEGACY', false, false),
      ] });
      const reverse = ['ONE_BRANCH_B', 'ONE_BRANCH_A', 'ONE_B_FIRST', 'ONE_A_FIRST', 'ONE_A_SECOND'];
      const normal = (name: string) => [name + '_BRANCH_A', name + '_BRANCH_B', name + '_A_FIRST', name + '_A_SECOND', name + '_B_FIRST'];
      expect(loadScenarioDoc(db, sid).parts.map((p) => p.transitions.map((r) => r.condition))).toEqual([
        reverse, normal('TWO'), normal('LEGACY'),
      ]);
      expect(loadProjectSpec(db, pid).transitions.map((r) => r.condition)).toEqual([...reverse, ...normal('TWO'), ...normal('LEGACY')]);
      // Реальные приоритеты переходов сохранены в прежнем порядке.
      expect((await call('GET', `/api/scenarios/${sid}`)).parts[0].steps.map((s: any) => s.condition)).toEqual(normal('ONE'));
      for (const url of [
        `/api/scenarios/${sid}/preview`,
        `/api/scenarios/${sid}/export?format=md`,
        `/api/projects/${pid}/export?format=md`,
        `/api/scenarios/${sid}/export?format=docx`,
        `/api/projects/${pid}/export?format=docx`,
      ]) {
        const body = await call('GET', url);
        const text = typeof body === 'string' ? body : await (await JSZip.loadAsync(await body.arrayBuffer())).file('word/document.xml')!.async('string');
        for (let i = 1; i < reverse.length; i++) {
          expect(text.indexOf(reverse[i - 1]), url).toBeGreaterThanOrEqual(0);
          expect(text.indexOf(reverse[i - 1]), url).toBeLessThan(text.indexOf(reverse[i]));
        }
      }
    } finally { db.close(); }
  });
});
