import { expect, test } from '@playwright/test';

test('UJ-4 настройки пользователя: профиль, email, пароль и выход', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Логин' }).fill('root');
  await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('password-1');
  await page.getByRole('textbox', { name: 'Повторите пароль' }).fill('password-1');
  await page.getByRole('button', { name: 'Создать и войти' }).click();
  await expect(page.getByRole('heading', { name: 'Проекты' })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить проект' }).click();
  const projectDialog = page.getByRole('dialog');
  await projectDialog.getByRole('textbox', { name: 'Название проекта' }).fill('Профиль проекта');
  await projectDialog.getByRole('button', { name: 'Создать' }).click();
  await page.getByRole('link', { name: 'Профиль проекта' }).click();
  await page.waitForURL(/#\/p\/\d+\/scenarios/);

  await page.getByRole('button', { name: 'Профиль: root' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  const groups = page.getByRole('menu').getByRole('group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText('Профиль проекта');
  await expect(groups.nth(0)).toContainText('Настройки проекта');
  await expect(groups.nth(0)).toContainText('Сменить проект');
  await expect(groups.nth(1)).toContainText('root');
  await page.getByRole('menuitem', { name: 'Настройки пользователя' }).click();
  await expect(page).toHaveURL(/#\/p\/\d+\/user-settings/);
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('menu')).toBeHidden();

  const nameInput = page.getByRole('textbox', { name: 'Имя пользователя' });
  await expect(nameInput).toHaveCount(0);
  await page.getByTestId('user-settings-login-value').click();
  await expect(nameInput).toHaveCount(0);
  await page.getByRole('button', { name: 'Изменить' }).nth(0).click();
  await expect(nameInput).toBeEditable();
  await nameInput.fill('root_user');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('user-settings-login-value')).toHaveText('root_user');
  await expect(page.getByRole('button', { name: 'Профиль: root_user' })).toBeVisible();

  const emailInput = page.getByRole('textbox', { name: 'Email' });
  await expect(emailInput).toHaveCount(0);
  await page.getByTestId('user-settings-email-value').click();
  await expect(emailInput).toHaveCount(0);
  await page.getByRole('button', { name: 'Изменить' }).nth(1).click();
  await expect(emailInput).toBeEditable();
  await emailInput.fill('root@example.com');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Email сохранен').last()).toBeVisible();
  await page.reload();
  await expect(emailInput).toHaveCount(0);
  await expect(page.getByTestId('user-settings-email-value')).toHaveText('root@example.com');

  await expect(page.getByRole('button', { name: 'Изменить пароль' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Профиль: root_user' }).click();
  await page.getByRole('menuitem', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible();
});