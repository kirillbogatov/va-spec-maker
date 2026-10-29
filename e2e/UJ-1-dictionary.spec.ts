import { expect, test } from '@playwright/test';
import { createViaDialog, openDemo } from './helpers';

test.describe('UJ-1 Описать словарь проекта', () => {
  test('ED-01-02 создать проект из списка проектов', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Добавить проект' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Название').fill('Проект E2E');
    await dialog.getByRole('button', { name: /Создать|Добавить/ }).click();
    await expect(page.getByText('Проект E2E').first()).toBeVisible();
  });

  test('ED-02-02 ED-02-04 создать интент и добавить фразу', async ({ page }) => {
    await openDemo(page, 'lists/intents');
    await createViaDialog(page, 'Новый интент', 'INT_E2E');
    await page.getByRole('link', { name: /INT_E2E/ }).click();
    await expect(page.getByLabel('Название')).toHaveValue('INT_E2E');
    await page.getByRole('textbox', { name: 'Добавить тренировочную фразу' }).fill('включи лампу');
    await page.keyboard.press('Enter');
    await expect(page.getByText('включи лампу').first()).toBeVisible();
  });

  test('ED-02-05 удалить интент с подтверждением', async ({ page }) => {
    await openDemo(page, 'lists/intents');
    await createViaDialog(page, 'Новый интент', 'INT_DEL');
    await page.getByRole('button', { name: 'Действия' }).click();
    await page.getByRole('menuitem', { name: /Удалить/ }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: /Удалить/ }).click();
    await expect(page.getByRole('link', { name: /INT_DEL/ })).toHaveCount(0);
  });

  test('ED-03-02 создать сущность', async ({ page }) => {
    await openDemo(page, 'entities');
    await createViaDialog(page, /Нов(ая|ый)/, 'ENT_E2E');
    await expect(page.getByRole('link', { name: /ENT_E2E/ })).toBeVisible();
  });

  test('ED-04-02 создать промпт', async ({ page }) => {
    await openDemo(page, 'lists/prompts');
    await createViaDialog(page, /Нов(ая|ый)/, 'PRM_E2E');
    await expect(page.getByRole('link', { name: /PRM_E2E/ })).toBeVisible();
  });

  test('ED-05-02 создать зависимость', async ({ page }) => {
    await openDemo(page, 'dependencies');
    await createViaDialog(page, /Нов(ая|ый)/, 'DEP_E2E');
    await expect(page.getByRole('link', { name: /DEP_E2E/ })).toBeVisible();
  });
});
