import { expect, test } from '@playwright/test';
import { DEMO, openDemo } from './helpers';

test.describe('UJ-1 Описать словарь проекта: списки и поиск', () => {
  test('ED-02-01 список интентов показывает интенты проекта и фильтруется', async ({ page }) => {
    await openDemo(page, 'lists/intents');
    await expect(page.getByRole('link', { name: /INT_LIGHT_ON/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Фильтр списка' }).fill('ALARM');
    await expect(page.getByRole('link', { name: /INT_ALARM_SET/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /INT_LIGHT_ON/ })).toHaveCount(0);
  });

  test('ED-03-01 список сущностей показывает сущности проекта', async ({ page }) => {
    await openDemo(page, 'entities');
    await expect(page.getByRole('link', { name: /ENT_ROOM/ })).toBeVisible();
  });

  test('ED-04-01 список промптов показывает промпты проекта', async ({ page }) => {
    await openDemo(page, 'lists/prompts');
    await expect(page.getByRole('link', { name: /PRM_/ }).first()).toBeVisible();
  });

  test('ED-05-01 список зависимостей показывает зависимости проекта', async ({ page }) => {
    await openDemo(page, 'dependencies');
    await expect(page.getByRole('link', { name: /DEP_HOME_MODE/ })).toBeVisible();
  });

  test('ED-07-01 список сценариев показывает сценарии проекта', async ({ page }) => {
    await openDemo(page);
    for (const n of ['SC_LIGHT', 'SC_CLIMATE', 'SC_ALARM']) await expect(page.getByRole('link', { name: n })).toBeVisible();
  });

  test('ED-09-04 глобальный поиск по клавише «/» находит интент', async ({ page }) => {
    await openDemo(page);
    await page.keyboard.press('/');
    await page.getByRole('combobox').or(page.getByRole('textbox')).last().fill('INT_ALARM_SET');
    await expect(page.getByText('INT_ALARM_SET').first()).toBeVisible();
  });
});

test.describe('UJ-3 / UJ-5 выгрузка и удаление проекта', () => {
  test('ED-08-03 выгрузить весь проект в Word', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Действия с проектом/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Скачать \.docx/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.docx$/);
  });

  test('ED-01-04 удалить проект с подтверждением', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Действия с проектом/ }).click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: /Удалить/ }).click();
    await expect(page.getByText(DEMO)).toHaveCount(0);
  });
});
