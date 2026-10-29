import { expect, test } from '@playwright/test';
import { DEMO } from './helpers';

test.describe('UJ-5 Сохранить и перенести данные', () => {
  test('ED-01-06 выгрузить копию проекта в JSON', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Действия с проектом/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Экспорт \(\.json\)/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
  });

  test('ED-01-05 дублировать проект', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Действия с проектом/ }).click();
    await page.getByRole('menuitem', { name: 'Дублировать' }).click();
    await expect(page.getByText(`${DEMO} (копия)`).first()).toBeVisible();
  });

  test('ED-01-03 переименовать проект', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Действия с проектом/ }).click();
    await page.getByRole('menuitem', { name: 'Переименовать' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill('Переименован E2E');
    await dialog.getByRole('button').filter({ hasNotText: /Закрыть|Отмена/ }).last().click();
    await expect(page.getByText('Переименован E2E').first()).toBeVisible();
  });
});
