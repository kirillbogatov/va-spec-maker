import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { ensureDemoBranches, keepOneDemoScenarioChange, seedDemo } from '../src/demo';

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
    const branches = await get(`/api/projects/${pid}/branches`);
    expect(branches.map((branch: any) => branch.branch_name)).toEqual(['main', 'v1.1', 'v1.2']);
    const scenariosWithPendingChanges = [];
    for (const branch of branches) {
      const branchScenarios = await get(`/api/projects/${branch.id}/scenarios`);
      scenariosWithPendingChanges.push(...branchScenarios.filter((scenario: any) => scenario.pending_change_count > 0));
    }
    expect(scenariosWithPendingChanges).toHaveLength(1);
    expect(await keepOneDemoScenarioChange(app, pid)).toBe(false);
    for (const [branchName, marker] of [
      ['v1.1', 'проверки новой логики'],
      ['v1.2', 'обсуждения изменений'],
    ]) {
      const branch = branches.find((candidate: any) => candidate.branch_name === branchName);
      const branchScenarios = await get(`/api/projects/${branch.id}/scenarios`);
      const branchScenario = await get(`/api/scenarios/${branchScenarios[0].id}`);
      expect(branchScenario.description).toContain(marker);
    }
    const mainScenarios = await get(`/api/projects/${pid}/scenarios`);
    const mainScenario = await get(`/api/scenarios/${mainScenarios[0].id}`);
    expect(mainScenario.description).not.toContain('проверки новой логики');
    for (const branch of branches.slice(1)) {
      const response = await app.handle({ method: 'DELETE', url: `/api/projects/${pid}/branches/${branch.id}` });
      expect(response.status).toBe(204);
    }
    expect(await ensureDemoBranches(app, pid)).toBe(true);
    expect(await ensureDemoBranches(app, pid)).toBe(false);
    const renamedBranches = await get(`/api/projects/${pid}/branches`);
    expect(renamedBranches.map((branch: any) => branch.branch_name)).toEqual(['main', 'v1.1', 'v1.2']);
    const renamedV11 = renamedBranches.find((branch: any) => branch.branch_name === 'v1.1');
    const v11Scenario = (await get(`/api/projects/${renamedV11.id}/scenarios`))[0];
    expect((await get(`/api/scenarios/${v11Scenario.id}`)).description).toContain('Вариант v1.1');
    for (const [versionName, legacyName] of [['v1.1', 'Эксперимент'], ['v1.2', 'Согласование']]) {
      const branch = (await get(`/api/projects/${pid}/branches`)).find((candidate: any) => candidate.branch_name === versionName);
      const response = await app.handle({ method: 'PATCH', url: `/api/projects/${pid}/branches/${branch.id}`, body: { name: legacyName } });
      expect(response.status).toBe(200);
    }
    expect(await ensureDemoBranches(app, pid)).toBe(true);
    expect(await ensureDemoBranches(app, pid)).toBe(false);
    expect((await get(`/api/projects/${pid}/branches`)).map((branch: any) => branch.branch_name)).toEqual(['main', 'v1.1', 'v1.2']);
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
