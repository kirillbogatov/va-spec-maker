import { expect, test } from '@playwright/test';
import { createViaDialog, openDemo } from './helpers';

test.describe('UJ-2 Собрать сценарий диалога', () => {
  test('ED-07-02 создать сценарий и увидеть вкладки формы', async ({ page }) => {
    await openDemo(page);
    await createViaDialog(page, 'Новый сценарий', 'SC_E2E');
    await expect(page.getByRole('link', { name: /SC_E2E/ })).toBeVisible();
    for (const tab of ['Общая информация', 'Интенты', 'Промпты', 'Логика', 'Ошибки', 'История изменений', 'Предпросмотр']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
  });

  test('ED-07-06 вкладка «Интенты» показывает подключённые интенты', async ({ page }) => {
    await openDemo(page, 'scenarios/1/intents');
    await expect(page.getByText('INT_LIGHT_ON').first()).toBeVisible();
    await expect(page.getByText('INT_LIGHT_OFF').first()).toBeVisible();
  });

  test('ED-07-10 вкладка «Промпты» показывает подключённые промпты', async ({ page }) => {
    await openDemo(page, 'scenarios/1/prompts');
    await expect(page.getByText(/PRM_/).first()).toBeVisible();
  });

  test('ED-07-04 вкладка «Логика» показывает схему состояний', async ({ page }) => {
    await openDemo(page, 'scenarios/1/logic');
    await expect(page.getByText(/ST_/).first()).toBeVisible();
  });

  test('ED-07-05 удалить сценарий; интенты остаются в словаре', async ({ page }) => {
    await openDemo(page);
    await createViaDialog(page, 'Новый сценарий', 'SC_DEL');
    await page.getByRole('button', { name: 'Действия со сценарием' }).click();
    await page.getByRole('menuitem', { name: /Удалить/ }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: /Удалить/ }).click();
    await expect(page.getByRole('link', { name: /SC_DEL/ })).toHaveCount(0);
    await page.goto('/#/p/1/lists/intents');
    await expect(page.getByText('INT_LIGHT_ON').first()).toBeVisible();
  });
});
