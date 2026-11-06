import { expect, test } from '@playwright/test';

test('template scenarios and their contents stay out of ordinary directories', async ({ page }) => {
  await page.goto('/');
  const ids = await page.evaluate(async () => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const { ensureBackend } = await load('/src/lib/backend.ts');
    await ensureBackend();
    const { api } = await load('/src/lib/api.ts');
    const project = await api.projects.create('Template isolation');
    const source = await api.scenarios.create(project.id, 'REGULAR_SCENARIO');
    await api.intents.create(source.id, 'INT_REGULAR');
    await api.prompts.create(source.id, 'PRM_REGULAR');
    const template = await api.scenarioTemplates.create(project.id, 'TEMP_PRIVATE', source.id);
    await api.intents.create(template.id, 'INT_PRIVATE');
    await api.prompts.create(template.id, 'PRM_PRIVATE');
    return { pid: project.id, sid: source.id, tid: template.id };
  });
  await page.goto(`/#/p/${ids.pid}/lists/intents`);
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('INT_REGULAR');
  const list = page.locator('main aside').first();
  await expect(list.getByRole('link', { name: /INT_PRIVATE|TEMP_PRIVATE/ })).toHaveCount(0);
  await page.goto(`/#/p/${ids.pid}/lists/prompts`);
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('PRM_REGULAR');
  await expect(page.locator('main aside').first().getByRole('link', { name: /PRM_PRIVATE|TEMP_PRIVATE/ })).toHaveCount(0);
  await page.goto(`/#/p/${ids.pid}/scenarios/${ids.sid}`);
  await expect(page.locator('main aside').first().getByRole('link', { name: /TEMP_PRIVATE/ })).toHaveCount(0);
  await page.goto(`/#/p/${ids.pid}/templates/scenarios/${ids.tid}/intents`);
  await expect(page.getByTitle('INT_PRIVATE', { exact: true })).toBeVisible();
});
