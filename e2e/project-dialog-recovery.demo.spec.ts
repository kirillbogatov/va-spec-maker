import { expect, test } from '@playwright/test';

test('ошибка сохранения проекта сохраняет форму и позволяет повторить запрос', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить проект', exact: true }).click();
  await page.evaluate(async () => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const { api } = await load('/src/lib/api.ts');
    const create = api.projects.create;
    let fail = true;
    api.projects.create = async (...args: Parameters<typeof create>) => {
      if (!fail) return create(...args);
      fail = false;
      await new Promise((resolve) => setTimeout(resolve, 700));
      throw new Error('Test save failure');
    };
  });
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('Название проекта');
  const description = dialog.getByLabel('Описание проекта');
  await name.fill('Восстановление после ошибки');
  await description.fill('Описание остаётся в форме');
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Сохранение…' })).toBeDisabled();
  await expect(name).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('Не удалось сохранить проект');
  await expect(name).toHaveValue('Восстановление после ошибки');
  await expect(description).toHaveValue('Описание остаётся в форме');
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Восстановление после ошибки', exact: true })).toBeVisible();
});
