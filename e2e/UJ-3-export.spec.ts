import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

test.describe('UJ-3 Проверить и выгрузить спецификацию', () => {
  test('ED-08-02 предпросмотр содержит разделы спецификации', async ({ page }) => {
    await openDemo(page, 'scenarios/1/preview');
    for (const h of ['Интенты', 'Сущности', 'Промпты', 'Переходы между состояниями']) {
      await expect(page.getByText(h, { exact: true }).first()).toBeVisible();
    }
  });

  test('ED-08-01 выгрузить сценарий в Word через меню экспорта', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Сценарий — Word/ }).click();
    expect((await download).suggestedFilename()).toMatch(/SC_LIGHT\.docx$/);
  });

  test('ED-08-01 выгрузить сценарий в Markdown через меню экспорта', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Сценарий — Markdown/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.md$/);
  });

  test('ED-07-03 форма сценария показывает вкладки и счётчики', async ({ page }) => {
    await openDemo(page);
    await expect(page.getByRole('tab', { name: /^Логика/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Интенты/ })).toBeVisible();
  });
});
