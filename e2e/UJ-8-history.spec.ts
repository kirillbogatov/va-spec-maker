import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

test.describe('UJ-8 Разобраться, что и когда менялось в сценарии', () => {
  test('ED-07-16 журнал изменений доступен для ручного заполнения и виден в предпросмотре', async ({ page }) => {
    await openDemo(page, 'scenarios/1/history');
    await expect(page.getByRole('region', { name: 'История изменений сценария' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'История изменений', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Добавить' }).first().click();
    await page.getByRole('textbox', { name: 'Задача, строка 1', exact: true }).fill('TASK-E2E');
    await page.getByRole('textbox', { name: 'Автор, строка 1', exact: true }).fill('Автор E2E');
    await page.getByRole('textbox', { name: 'Описание изменений, строка 1', exact: true }).fill('Проверка журнала');
    await page.waitForTimeout(1500);
    await page.getByRole('tab', { name: /^Предпросмотр/ }).click();
    await expect(page.getByText('Журнал изменений').first()).toBeVisible();
    await expect(page.getByText(/TASK-E2E/).first()).toBeVisible();
  });

  test('новая строка появляется первой, в том числе после сортировки', async ({ page }) => {
    await openDemo(page, 'scenarios/1/history');
    const add = page.getByRole('button', { name: 'Добавить', exact: true });
    const task = () => page.getByRole('textbox', { name: /^Задача, строка/ });
    await add.click();
    await task().first().fill('Z-1');
    await add.click();
    await expect(task().first()).toHaveValue('');
    await expect(task().nth(1)).toHaveValue('Z-1');
    await task().first().fill('A-1');
    await page.getByRole('button', { name: 'Сортировать: Задача', exact: true }).click();
    await add.click();
    await expect(task().first()).toHaveValue('');
    await expect(task().nth(1)).toHaveValue('A-1');
    const tabs = await page.getByRole('tab').allTextContents();
    expect(tabs.indexOf('История изменений')).toBe(tabs.indexOf('Предпросмотр') - 1);
    await expect(page.getByText('Журнал событий', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Удалить строку 1', exact: true }).locator('svg')).toHaveClass(/lucide-x/);
  });
});
