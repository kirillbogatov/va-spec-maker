import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { seedDemo } from '../src/demo';

it('demo templates include reusable answers and all toggle outcomes, and can be cloned', async () => {
  const app = createApp(await openDb());
  const pid = await seedDemo(app);
  const call = async (method: string, url: string, body?: unknown): Promise<any> => {
    const response = await app.handle({ method, url, body });
    expect(response.status).toBeLessThan(400);
    return response.body;
  };
  const answers = await call('GET', `/api/projects/${pid}/response-templates`);
  expect(answers.map((p: any) => p.name)).toEqual(['TEMP_FEATURE_UNAVAILABLE', 'TEMP_ALREADY_IN_STATE']);
  expect(answers.every((p: any) => p.full_answers.length && p.short_answers.length)).toBe(true);
  const templates = await call('GET', `/api/projects/${pid}/scenario-templates`);
  const template = templates.find((s: any) => s.name === 'TEMP_FEATURE_ON_OFF');
  expect(template).toBeDefined();
  const clone = await call('POST', `/api/projects/${pid}/scenarios`, { name: 'SC_TOGGLE_COPY', template_id: template.id });
  const scenario = await call('GET', `/api/scenarios/${clone.id}`);
  expect(scenario.is_template).toBe(false);
  expect(scenario.parts[0].steps).toHaveLength(6);
  expect(scenario.parts[0].steps.map((s: any) => s.next_states)).toEqual([
    'ST_ON', 'ST_ALREADY_ON', 'ST_OFF', 'ST_ALREADY_OFF', 'ST_UNAVAILABLE', 'ST_UNAVAILABLE',
  ]);
  const prompts = await call('GET', `/api/scenarios/${clone.id}/prompts`);
  expect(prompts).toHaveLength(5);
  const detail = await call('GET', `/api/scenarios/${template.id}`);
  for (const state of ['ST_ALREADY_ON', 'ST_ALREADY_OFF', 'ST_UNAVAILABLE']) {
    expect(detail.parts[0].layout[state].system_action).toBe('');
    expect(scenario.parts[0].layout[state].prompt_id).toBeTruthy();
  }
});
