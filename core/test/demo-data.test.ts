import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { seedDemo } from '../src/demo';

it('demo separates entities from external dependencies and keeps scenario references complete', async () => {
  const db = await openDb();
  try {
    const app = createApp(db);
    const pid = await seedDemo(app);
    const get = async (url: string): Promise<any> => {
      const response = await app.handle({ method: 'GET', url });
      expect(response.status, url).toBe(200);
      return response.body;
    };
    const entities = await get(`/api/projects/${pid}/entities`);
    const dictionary = await get(`/api/projects/${pid}/dependency-dictionary`);
    const entityIds = new Set(entities.map((e: any) => e.id));
    const entityNames = new Set(entities.map((e: any) => e.name));
    expect(dictionary.every((d: any) => !entityNames.has(d.name))).toBe(true);
    const scenarios = [
      ...await get(`/api/projects/${pid}/scenarios`),
      ...await get(`/api/projects/${pid}/scenario-templates`),
    ];
    expect(scenarios.length).toBeGreaterThan(0);
    for (const summary of scenarios) {
      const scenario = await get(`/api/scenarios/${summary.id}`);
      const localEntities = new Set(scenario.entities.map((e: any) => e.entity_id));
      const deps = new Map<string, any>(scenario.dependencies.map((d: any) => [d.ref, d]));
      const intents = await get(`/api/scenarios/${summary.id}/intents`);
      const prompts = await get(`/api/scenarios/${summary.id}/prompts`);
      for (const entity of scenario.entities) expect(entityIds.has(entity.entity_id), summary.name).toBe(true);
      for (const dependency of scenario.dependencies) {
        expect(dependency.entity_id, summary.name).toBeNull();
        expect(entityNames.has(dependency.name), summary.name).toBe(false);
        const record = dictionary.find((d: any) => d.id === dependency.dictionary_id);
        expect(record, summary.name).toBeDefined();
        expect(dependency.name).toBe(record.name);
        expect(dependency.type === 'bool' ? ['true', 'false'] : dependency.options).toEqual(record.values);
      }
      for (const intent of intents) {
        const detail = await get(`/api/intents/${intent.id}`);
        for (const entity of detail.entities) expect(localEntities.has(entity.entity_id), `${summary.name}: ${intent.name}`).toBe(true);
      }
      for (const part of scenario.parts) {
        for (const transition of part.steps) {
          if (transition.intent_id != null) expect(intents.some((i: any) => i.id === transition.intent_id)).toBe(true);
          for (const condition of transition.conditions) {
            if (condition.entity_id != null) expect(localEntities.has(condition.entity_id), summary.name).toBe(true);
            else if (condition.dep) expect(deps.has(condition.dep), summary.name).toBe(true);
          }
        }
        for (const state of Object.values(part.layout) as any[]) {
          if (state.prompt_id != null) expect(prompts.some((p: any) => p.id === state.prompt_id), summary.name).toBe(true);
        }
      }
    }
  } finally {
    db.close();
  }
});
