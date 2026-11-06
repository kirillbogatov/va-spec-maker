import { expect, test } from '@playwright/test';

test('клик по фону схемы открывает свойства текущего подсценария', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1/logic');
  const flow = page.locator('.react-flow');
  await expect(flow).toHaveCSS('opacity', '1');
  const name = page.getByLabel('Название вкладки', { exact: true });
  const tab = page.getByRole('tablist', { name: 'Вкладки сценария', exact: true }).getByRole('tab').first();
  await tab.click();
  const partName = await name.inputValue();
  const pane = page.locator('.react-flow__pane');
  const openPart = async () => {
    await pane.click({ position: { x: 15, y: 15 } });
    await expect(name).toBeVisible();
    await expect(name).toHaveValue(partName);
  };
  await openPart();
  await page.locator('.react-flow__node').first().click();
  await expect(name).toHaveCount(0);
  await openPart();
  await page.locator('.react-flow__edgelabel-renderer button').first().click();
  await expect(name).toHaveCount(0);
  await openPart();
  await page.locator('button[title^="Развернуть схему"]').click();
  await openPart();
});
