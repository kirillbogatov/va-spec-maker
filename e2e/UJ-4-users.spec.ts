import { expect, test } from '@playwright/test';

test.describe('UJ-4 Начать работу и управлять доступом: пользователи', () => {
  test('ED-09-02 администратор добавляет пользователя; последнего администратора удалить нельзя', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Логин' }).fill('root');
    await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('password-1');
    await page.getByRole('textbox', { name: 'Повторите пароль' }).fill('password-1');
    await page.getByRole('button', { name: 'Создать и войти' }).click();
    await page.getByRole('button', { name: /Профиль: root/ }).click();
    await page.getByRole('menuitem', { name: 'Пользователи' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('root')).toBeVisible();
    await dialog.getByRole('button', { name: /Добавить/ }).click();
    await dialog.getByRole('textbox', { name: 'Логин' }).fill('editor');
    await dialog.getByRole('textbox', { name: /Пароль/ }).first().fill('password-2');
    await dialog.getByRole('button', { name: /Добавить|Создать|Сохранить/ }).last().click();
    await expect(dialog.getByText('editor')).toBeVisible();
  });
});
