import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

describe('порядок состояний', () => {
  it('сохраняет порядок вместе со свойствами и переходами без изменения их приоритета', async () => {
    const db = await openDb();
    try {
      const app = createApp(db);
      const call = async (method: string, url: string, body?: unknown) => {
        const r = await app.handle({ method, url, body });
        expect(r.status).toBeLessThan(400);
        return r.body as any;
      };
      const project = await call('POST', '/api/projects', { name: 'Order' });
      const scenario = await call('POST', `/api/projects/${project.id}/scenarios`, { name: 'Scenario' });
      const full = await call('GET', `/api/scenarios/${scenario.id}`);
      full.parts[0].layout = {
        VA_ACTIVATION: { x: 0, y: 0, order: 0, description: 'Вход' },
        ST_A: { x: 0, y: 0, order: 2, description: 'Первое' },
        ST_B: { x: 0, y: 0, order: 1, description: 'Второе', system_action: 'action()' },
      };
      full.parts[0].steps = ['ST_A', 'ST_B'].map((to) => ({
        kind: 'transition', state: 'VA_ACTIVATION', next_states: to, intent_id: null, request_params: '',
        condition: '', conditions: [], prompt_id: null, system_action: '',
      }));
      await call('PUT', `/api/scenarios/${scenario.id}`, full);
      const saved = await call('GET', `/api/scenarios/${scenario.id}`);
      expect(saved.parts[0].layout.ST_A).toMatchObject({ order: 2, description: 'Первое' });
      expect(saved.parts[0].layout.ST_B).toMatchObject({ order: 1, system_action: 'action()' });
      expect(saved.parts[0].steps.map((s: any) => s.next_states)).toEqual(['ST_A', 'ST_B']);
    } finally { db.close(); }
  });
});
