import { expect, test } from '@playwright/test';

test('демо оставляет одно непроверенное изменение и показывает подсказку и вкладки в нужном порядке', async ({ page }) => {
  await page.goto('/');
  const demo = await page.evaluate(async () => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const { api } = await load('/src/lib/api.ts');
    const project = (await api.projects.list()).find((item: any) => item.name.startsWith('Демо:'));
    if (!project) throw new Error('Демо-проект не найден');
    const branches = await api.projects.branches(project.id);
    let pendingScenarioCount = 0;
    let pendingEventCount = 0;
    let pendingScenario: { branchId: number; scenarioId: number } | undefined;
    for (const branch of branches) {
      for (const scenario of await api.scenarios.list(branch.id)) {
        const { changes } = await api.scenarios.changes(scenario.id);
        if (changes.length) {
          pendingScenarioCount++;
          pendingEventCount += changes.length;
          pendingScenario ??= { branchId: branch.id, scenarioId: scenario.id };
        }
      }
    }
    return { ...pendingScenario, pendingScenarioCount, pendingEventCount };
  });

  expect(demo.pendingScenarioCount).toBe(1);
  expect(demo.pendingEventCount).toBe(1);
  await page.goto(`/#/p/${demo.branchId}/scenarios/${demo.scenarioId}/general`);
  await expect(page.getByRole('button', { name: 'Есть непроверенные изменения' })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Разделы сценария' }).getByRole('tab');
  const order = await tabs.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')?.split('/').at(-1)));
  expect(order).toEqual(['general', 'intents', 'prompts', 'sections', 'logic', 'history', 'preview']);
});
