import { expect, test } from '@playwright/test';

test('копирование и вставка состояния, Delete и копия вкладки', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto('/#/p/1/scenarios/1/logic');
  const canvas = page.getByRole('region', { name: 'Редактор схемы' });
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.nth(1)).toBeVisible();
  const count = await nodes.count();
  const edgeCount = await page.locator('.react-flow__edge').count();
  await nodes.nth(1).click();
  const sourceName = await page.getByLabel('Имя состояния', { exact: true }).inputValue();
  await page.getByLabel('Описание состояния').fill('Описание для копирования');
  await canvas.press('Control+c');
  await canvas.press('Control+v');
  await expect(nodes).toHaveCount(count + 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(edgeCount);
  const pastedName = await page.getByLabel('Имя состояния', { exact: true }).inputValue();
  expect(pastedName).not.toBe(sourceName);
  await expect(page.getByLabel('Описание состояния')).toHaveValue('Описание для копирования');
  await page.getByLabel('Описание состояния').fill('Независимая копия');
  await page.getByLabel('Описание состояния').press('Delete');
  await expect(nodes).toHaveCount(count + 1);
  await canvas.press('Control+d');
  await expect(nodes).toHaveCount(count + 1);
  await canvas.press('Backspace');
  await expect(nodes).toHaveCount(count + 1);
  await canvas.press('Delete');
  await expect(nodes).toHaveCount(count);
  await canvas.press('Control+v');
  await expect(nodes).toHaveCount(count + 1);
  await expect(page.getByLabel('Описание состояния')).toHaveValue('Описание для копирования');
  await canvas.press('Delete');
  await expect(nodes).toHaveCount(count);
  // Обычный текст в буфере не создаёт состояние.
  await page.evaluate(() => navigator.clipboard.writeText('Обычный текст'));
  await canvas.press('Control+v');
  await expect(nodes).toHaveCount(count);
  await expect(page.getByRole('button', { name: 'Горячие клавиши схемы' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Отменить изменение схемы' })).toHaveCount(0);

  const tablist = page.getByRole('tablist', { name: 'Вкладки сценария' });
  await expect(page.getByRole('button', { name: 'Создать копию вкладки', exact: true })).toHaveCount(0);
  if (await tablist.getByRole('tab').count() === 0) {
    await page.getByRole('button', { name: 'Добавить вкладку', exact: true }).click();
  }
  await tablist.getByRole('tab').first().click();
  const originalTabs = await tablist.getByRole('tab').count();
  await page.getByRole('button', { name: 'Дублировать вкладку', exact: true }).click();
  await expect(page.getByLabel('Название вкладки')).toHaveValue(/— копия$/);
  const copyName = await page.getByLabel('Название вкладки').inputValue();
  await page.getByLabel('Описание вкладки').fill('Описание копии вкладки');
  await expect(page.getByRole('complementary', { name: 'Свойства', exact: true }).getByRole('button', { name: 'Закрыть', exact: true })).toHaveCount(0);
  await expect(nodes).toHaveCount(count);
  await expect(tablist.getByRole('tab')).toHaveCount(Math.max(originalTabs, 1) + 1);
  await tablist.getByRole('tab').first().click();
  await expect(page.getByLabel('Описание вкладки')).not.toHaveValue('Описание копии вкладки');
  await tablist.getByRole('tab', { name: copyName, exact: true }).click();
  await expect(page.getByLabel('Описание вкладки')).toHaveValue('Описание копии вкладки');
  await expect(page.getByRole('status').filter({ hasText: /^Сохранение…$/ })).toHaveCount(0);
  await expect(page.getByText('Сохранено', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('scheme-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('scheme-mobile.png'), fullPage: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('tab', { name: copyName, exact: true })).toBeVisible();
});
