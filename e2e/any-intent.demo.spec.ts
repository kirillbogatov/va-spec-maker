import { expect, test, type Page } from '@playwright/test';

async function request(page: Page, method: string, url: string) {
  return page.evaluate(async ({ method, url }) => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const backend = await load('/src/lib/backend.ts');
    await backend.ensureBackend();
    return backend.request(method, url);
  }, { method, url });
}

test('любой интент сохраняется, экспортируется и отличается от пустого выбора', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1/logic');
  await expect(page.locator('.react-flow')).toHaveCSS('opacity', '1');
  const before = await request(page, 'GET', '/api/projects/1/intents');
  await page.locator('.react-flow__edgelabel-renderer button').first().click();
  const select = page.getByLabel('Интент', { exact: true });
  const originalName = (await select.innerText()).trim();
  await select.click();
  await page.getByRole('option').filter({ hasText: 'Any intent' }).click();
  await expect(select).toContainText('Любой интент');
  const wildcardCount = async () => {
    const result = await request(page, 'GET', '/api/scenarios/1');
    return result.body.parts.flatMap((part: any) => part.steps).filter((step: any) => step.match_any_intent).length;
  };
  await expect.poll(wildcardCount).toBe(1);
  const saved = await request(page, 'GET', '/api/scenarios/1');
  const any = saved.body.parts.flatMap((part: any) => part.steps).find((step: any) => step.match_any_intent);
  expect(any.intent_id).toBeNull();
  expect((await request(page, 'GET', '/api/projects/1/intents')).body).toHaveLength(before.body.length);
  expect((await request(page, 'GET', '/api/scenarios/1/export?format=md&lang=ru')).body).toContain('Любой интент');
  expect((await request(page, 'GET', '/api/scenarios/1/export?format=md&lang=en')).body).toContain('Any intent');
  await page.reload();
  await expect(page.locator('.react-flow')).toHaveCSS('opacity', '1');
  await page.locator('.react-flow__edgelabel-renderer button').filter({ hasText: 'Любой интент' }).first().click();
  await expect(select).toContainText('Любой интент');
  await select.click();
  await page.getByRole('option', { name: '— не выбран —', exact: true }).click();
  await expect.poll(wildcardCount).toBe(0);
  await expect(select).toContainText('— не выбран —');
  await select.click();
  await page.getByRole('option').filter({ has: page.getByText(originalName, { exact: true }) }).click();
  await expect(select).toContainText(originalName);
  await expect.poll(async () => {
    const result = await request(page, 'GET', '/api/scenarios/1');
    const step = result.body.parts.flatMap((part: any) => part.steps).find((step: any) => step.state === any.state && step.next_states === any.next_states);
    return { id: step.intent_id, any: step.match_any_intent };
  }).toEqual({ id: expect.any(Number), any: false });
});
