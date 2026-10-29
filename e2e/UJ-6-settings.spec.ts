import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

test.describe('UJ-6 Настроить проект под правила команды', () => {
  test('ED-09-03 настройки проекта открываются из меню профиля', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Профиль: demo' }).first().click();
    await page.getByRole('menuitem', { name: 'Настройки' }).click();
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await expect(page.getByText('Префиксы названий')).toBeVisible();
    await expect(page.getByText('Язык спецификации')).toBeVisible();
  });

  test('ED-09-03 режим «Ключевые слова» открывает справочник ключевых слов', async ({ page }) => {
    await openDemo(page, 'settings');
    await page.getByRole('radio', { name: /Ключевые слова/ }).check();
    await expect(page.getByRole('link', { name: 'Ключевые слова' })).toBeVisible();
  });

  test('ED-09-03 префикс подставляется в название нового интента', async ({ page }) => {
    await openDemo(page, 'settings');
    await page.getByRole('textbox', { name: /Интенты/ }).fill('XINT_');
    await page.getByRole('link', { name: 'Интенты' }).first().click();
    await page.getByRole('button', { name: 'Новый интент' }).first().click();
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Название' })).toHaveValue(/^XINT_/);
  });
});
