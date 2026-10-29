import { expect, test } from '@playwright/test';
import { DEMO } from './helpers';

test.describe('UJ-7 Попробовать продукт без регистрации', () => {
  test('ED-09-07 демо открывается без входа и содержит демо-проект', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(DEMO).first()).toBeVisible();
    await expect(page.getByText(/Live-демо/)).toBeVisible();
    await expect(page.getByText('Создайте администратора')).toHaveCount(0);
  });

  test('ED-01-01 список проектов показывает счётчики', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/3 сценария/)).toBeVisible();
  });
});
