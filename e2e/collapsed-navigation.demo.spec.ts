import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

test('переход из свёрнутого меню открывает список и сохраняет его после выбора элемента', async ({ page }) => {
  await openDemo(page);
  const menu = page.locator('aside').first();
  const hide = page.getByRole('button', { name: 'Скрыть список', exact: true });
  const restore = menu.getByRole('button', { name: 'Развернуть меню и список', exact: true });

  // Переход между разделами и повторное открытие текущего раздела.
  for (const name of ['Интенты', 'Интенты', 'Сущности', 'Промпты', 'Зависимости', 'Сценарии']) {
    await hide.click();
    await expect(restore).toBeVisible();
    await menu.getByRole('link', { name, exact: true }).click();
    // Дожидаемся автоматического выбора, из-за которого список раньше исчезал.
    await expect(page).toHaveURL(/\/(?:scenarios|intents|entities|prompts|dependencies)\/\d+$/);
    await expect(hide).toBeVisible();
    await expect(page.locator('aside').filter({ has: hide })).toBeVisible();
    await expect(restore).toHaveCount(0);
  }
});
