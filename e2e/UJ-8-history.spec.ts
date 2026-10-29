import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

test.describe('UJ-8 Разобраться, что и когда менялось в сценарии', () => {
  test('ED-07-16 журнал изменений доступен для ручного заполнения и виден в предпросмотре', async ({ page }) => {
    await openDemo(page, 'scenarios/1/history');
    await expect(page.getByText('Журнал изменений').first()).toBeVisible();
    await page.getByRole('button', { name: 'Добавить' }).first().click();
    const fields = page.getByRole('textbox');
    await fields.nth(1).fill('TASK-E2E');
    await fields.nth(2).fill('Автор E2E');
    await fields.nth(3).fill('Проверка журнала');
    await page.waitForTimeout(1500);
    await page.getByRole('tab', { name: /^Предпросмотр/ }).click();
    await expect(page.getByText('Журнал изменений').first()).toBeVisible();
    await expect(page.getByText(/TASK-E2E/).first()).toBeVisible();
  });

  test('ED-07-14 правка интента попадает в историю сценария', async ({ page }) => {
    await openDemo(page, 'lists/intents');
    await page.getByRole('link', { name: /INT_LIGHT_ON/ }).click();
    await expect(page.getByLabel('Название')).toHaveValue('INT_LIGHT_ON');
    await page.getByRole('textbox', { name: 'Добавить тренировочную фразу' }).fill('зажги лампу');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    await openDemo(page, 'scenarios/1/history');
    await expect(page.getByText(/зажги лампу/).first()).toBeVisible();
  });
});
