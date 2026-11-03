import { expect, test } from '@playwright/test';

test('в переходе показаны примеры интентов с паттернами', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto('/#/p/1/scenarios/1/logic');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.evaluate(async () => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const backend = await load('/src/lib/backend.ts');
    await backend.ensureBackend();
    const before = sessionStorage.getItem('va-demo-db');
    for (const [name, values] of [
      ['INT_HINT_SOURCE', [{ text: '* включи детский замок *', kind: 'pattern' }]],
      ['INT_HINT_PATTERN', [{ text: '* выключи детский замок *', kind: 'pattern' }]],
    ] as const) {
      const created = await backend.request('POST', '/api/scenarios/1/intents', { name });
      if (created.status !== 201) throw new Error('Не удалось создать интент');
      const saved = await backend.request('PUT', `/api/intents/${created.body.id}`, { name, values });
      if (saved.status !== 200) throw new Error('Не удалось сохранить интент');
    }
    const started = Date.now();
    while (sessionStorage.getItem('va-demo-db') === before && Date.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
  await page.reload();
  await page.locator('.react-flow__edgelabel-renderer button').first().click();
  await page.getByLabel('Интент', { exact: true }).click();
  await expect(page.getByRole('option', { name: /INT_HINT_SOURCE/ })).toContainText('* включи детский замок *');
  await expect(page.getByRole('option', { name: /INT_HINT_PATTERN/ })).toContainText('* выключи детский замок *');
  await page.getByRole('combobox', { name: 'Поиск', exact: true }).fill('Включи детский замок');
  await expect(page.getByRole('option', { name: /INT_HINT_SOURCE/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /INT_HINT_PATTERN/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('intent-example-desktop.png') });
});
