import { expect, test } from '@playwright/test';

test.describe('UJ-4 Начать работу и управлять доступом', () => {
  test('ED-09-01 первый запуск: создать администратора, выйти и войти снова', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Создайте администратора')).toBeVisible();
    await page.getByRole('textbox', { name: 'Логин' }).fill('admin');
    await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('password-1');
    await page.getByRole('textbox', { name: 'Повторите пароль' }).fill('password-1');
    await page.getByRole('button', { name: 'Создать и войти' }).click();
    await expect(page.getByRole('button', { name: /Профиль: admin/ })).toBeVisible();
    await page.getByRole('button', { name: /Профиль: admin/ }).click();
    await page.getByRole('menuitem', { name: 'Выйти' }).click();
    await page.getByRole('textbox', { name: 'Логин' }).fill('admin');
    await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText(/Неверн/)).toBeVisible();
    await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('password-1');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('button', { name: /Профиль: admin/ })).toBeVisible();
  });

  test('ED-09-01 пароль короче 8 символов отклоняется', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Логин' }).fill('admin2');
    await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('short');
    await page.getByRole('textbox', { name: 'Повторите пароль' }).fill('short');
    await page.getByRole('button', { name: 'Создать и войти' }).click();
    await expect(page.getByText(/8/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Профиль:/ })).toHaveCount(0);
  });
});
