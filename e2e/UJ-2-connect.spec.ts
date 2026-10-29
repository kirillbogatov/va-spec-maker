import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers';

const intentsRegion = (page: Page) => page.getByRole('region', { name: 'Интенты сценария' });

async function connectExisting(page: Page, kind: 'интент' | 'промпт', name: RegExp) {
  await page.getByRole('combobox', { name: `Подключить существующий ${kind}` }).click();
  await page.getByRole('option', { name }).click();
  // после подключения открывается карточка объекта
  await expect(page.getByRole('dialog')).toBeVisible();
}

const done = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'Готово' }).click();

test.describe('UJ-2 Собрать сценарий диалога: подключение объектов словаря', () => {
  test('ED-07-07 создать интент прямо в сценарии; он попадает в словарь', async ({ page }) => {
    await openDemo(page, 'scenarios/1/intents');
    await page.getByRole('button', { name: 'Интент', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Название интента' }).fill('INT_IN_SCENARIO');
    await page.waitForTimeout(1500);
    await dialog.getByRole('button', { name: 'Готово' }).click();
    await expect(intentsRegion(page).getByText('INT_IN_SCENARIO')).toBeVisible();
    await page.goto('/#/p/1/lists/intents');
    await page.reload();
    await expect(page.getByRole('link', { name: /INT_IN_SCENARIO/ })).toBeVisible();
  });

  test('ED-07-08 подключить существующий интент и сделать его глобальным', async ({ page }) => {
    await openDemo(page, 'scenarios/1/intents');
    await connectExisting(page, 'интент', /INT_ALARM_SET/);
    await done(page);
    await expect(intentsRegion(page).getByText('INT_ALARM_SET')).toBeVisible();
    const toggle = page.getByRole('switch', { name: 'Интент INT_ALARM_SET глобальный' });
    await toggle.click();
    await expect(toggle).toBeChecked();
  });

  test('ED-07-09 отключить интент от сценария; интент остаётся в словаре', async ({ page }) => {
    await openDemo(page, 'scenarios/1/intents');
    await connectExisting(page, 'интент', /INT_ALARM_SET/);
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    const choice = page.getByRole('alertdialog').or(page.getByRole('dialog')).last();
    await choice.getByRole('button', { name: /Убрать|Отключить|из сценария/ }).first().click();
    await expect(intentsRegion(page).getByText('INT_ALARM_SET')).toHaveCount(0);
    await page.goto('/#/p/1/lists/intents');
    await expect(page.getByRole('link', { name: /INT_ALARM_SET/ })).toBeVisible();
  });

  test('ED-07-11 создать промпт прямо в сценарии', async ({ page }) => {
    await openDemo(page, 'scenarios/1/prompts');
    const before = await page.getByRole('button', { name: /PRM_/ }).count();
    await page.getByRole('button', { name: 'Промпт', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Готово' }).click();
    await expect(page.getByRole('button', { name: /Новый промпт/ })).toHaveCount(1);
    expect(before).toBeGreaterThan(0);
  });

  test('ED-07-12 подключить существующий промпт', async ({ page }) => {
    await openDemo(page, 'scenarios/2/prompts');
    const before = await page.getByRole('button', { name: /^PRM_/ }).count();
    await page.getByRole('combobox', { name: 'Подключить существующий промпт' }).click();
    await page.getByRole('option').first().click();
    await expect(page.getByRole('button', { name: /^PRM_/ })).toHaveCount(before + 1);
  });

  test('ED-07-13 отключить промпт от сценария; промпт остаётся в словаре', async ({ page }) => {
    await openDemo(page, 'scenarios/2/prompts');
    await page.getByRole('combobox', { name: 'Подключить существующий промпт' }).click();
    const option = page.getByRole('option').first();
    const name = ((await option.innerText()).split(/\s/)[0] ?? '').trim();
    await option.click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    const choice = page.getByRole('alertdialog').or(page.getByRole('dialog')).last();
    await choice.getByRole('button', { name: /Убрать|Отключить|из сценария/ }).first().click();
    await page.goto('/#/p/1/lists/prompts');
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  });
});
