import { expect, test, type Page } from '@playwright/test';

async function openDemoProject(page: Page) {
  await page.goto('/#/');
  await page.getByText(/^Демо: (автомобиль|умный дом)$/).first().click();
  await page.waitForURL(/#\/p\/\d+/);
  return Number(/#\/p\/(\d+)/.exec(page.url())![1]);
}

async function gotoSection(page: Page, projectId: number, section: string) {
  await page.goto(`/#/p/${projectId}/${section}`);
}

test('response templates prefill editable answers with an empty prompt name', async ({ page }) => {
  const pid = await openDemoProject(page);
  await page.locator('aside').first().getByRole('button', { name: 'Шаблоны', exact: true }).click();
  await page.getByRole('link', { name: 'Шаблоны ответов', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Скрыть список', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить', exact: true }).first().click();
  await expect(page.getByRole('dialog').getByLabel('Название', { exact: true })).toHaveValue('TEMP_');
  await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill('PRM_TEMPLATE');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('PRM_TEMPLATE');
  await page.getByLabel('Полный ответ: добавить вариант', { exact: true }).fill('Полный ответ шаблона');
  await page.getByLabel('Полный ответ: добавить вариант', { exact: true }).press('Enter');
  await page.getByLabel('Короткий ответ: добавить вариант', { exact: true }).fill('Короткий ответ шаблона');
  await page.getByLabel('Короткий ответ: добавить вариант', { exact: true }).press('Enter');
  await expect(page.getByLabel('Короткий ответ, вариант 1', { exact: true })).toHaveValue('Короткий ответ шаблона');
  await gotoSection(page, pid, 'scenarios');
  await page.getByRole('tab', { name: /^Промпты/ }).click();
  await page.getByRole('combobox', { name: 'Взять из шаблона', exact: true }).click();
  await page.getByRole('option', { name: /PRM_TEMPLATE/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Промпт', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Полный ответ', { exact: true })).toHaveValue('Полный ответ шаблона');
  await expect(dialog.getByLabel('Короткий ответ', { exact: true })).toHaveValue('Короткий ответ шаблона');
  await page.screenshot({ path: 'test-results/templates-review/response-dialog-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/templates-review/response-dialog-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await dialog.getByLabel('Промпт', { exact: true }).fill('PRM_FROM_TEMPLATE');
  await dialog.getByLabel('Полный ответ', { exact: true }).fill('Изменённый ответ');
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('PRM_FROM_TEMPLATE', { exact: true })).toBeVisible();
  await gotoSection(page, pid, 'templates/responses');
  await expect(page.getByLabel('Полный ответ, вариант 1', { exact: true })).toHaveValue('Полный ответ шаблона');
  await page.screenshot({ path: 'test-results/templates-review/responses-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/templates-review/responses-mobile.png', fullPage: true });
});

test('scenario templates support both sources, cloning and saving from the actions menu', async ({ page }) => {
  const pid = await openDemoProject(page);
  await page.getByRole('link', { name: /^SC_CLIMATE(?:\s|$)/ }).click();
  await expect(page.getByLabel('Название сценария', { exact: true })).toHaveValue('SC_CLIMATE');
  await page.getByLabel('Описание сценария', { exact: true }).fill('Описание для шаблона');
  await page.getByRole('button', { name: 'Действия со сценарием', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Сохранить как шаблон', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Название', { exact: true })).toHaveValue('TEMP_SC_CLIMATE');
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page).toHaveURL(/templates\/scenarios\/\d+$/);
  await expect(page.getByLabel('Описание сценария', { exact: true })).toHaveValue('Описание для шаблона');
  await expect(page.getByRole('button', { name: 'Скрыть список', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Новый шаблон сценария', exact: true }).first().click();
  await expect(dialog.getByLabel('Название', { exact: true })).toHaveValue('TEMP_');
  const source = dialog.getByRole('combobox', { name: 'Исходный сценарий или шаблон', exact: true });
  await expect(source).toHaveText('Без исходного сценария');
  await source.click();
  await expect(page.getByRole('option', { name: /^SC_CLIMATE/ })).toBeVisible();
  await page.getByRole('option', { name: /^TEMP_SC_CLIMATE/ }).click();
  await dialog.getByLabel('Название', { exact: true }).fill('TEMP_SECOND');
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByLabel('Название сценария', { exact: true })).toHaveValue('TEMP_SECOND');
  const templateUrl = page.url();
  const readiness = page.getByRole('link', { name: 'Не готов', exact: true });
  if (await readiness.count()) {
    await readiness.click();
    await expect(page).toHaveURL(/templates\/scenarios\/\d+\//);
  }
  await page.goto(templateUrl);
  await expect(page.getByLabel('Название сценария', { exact: true })).toHaveValue('TEMP_SECOND');
  await page.screenshot({ path: 'test-results/templates-review/scenarios-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/templates-review/scenarios-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoSection(page, pid, 'scenarios');
  await page.getByRole('button', { name: 'Новый сценарий', exact: true }).first().click();
  await expect(dialog.getByRole('combobox', { name: 'Шаблон сценария', exact: true })).toHaveText('Без шаблона');
  await dialog.getByRole('combobox', { name: 'Шаблон сценария', exact: true }).click();
  await page.getByRole('option', { name: /^TEMP_SECOND/ }).click();
  await dialog.getByLabel('Название', { exact: true }).fill('SC_FROM_TEMPLATE');
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByLabel('Название сценария', { exact: true })).toHaveValue('SC_FROM_TEMPLATE');
  await expect(page.getByLabel('Описание сценария', { exact: true })).toHaveValue('Описание для шаблона');
  await page.getByLabel('Описание сценария', { exact: true }).fill('Независимая копия');
  await gotoSection(page, pid, 'templates/scenarios');
  await expect(page.getByLabel('Описание сценария', { exact: true })).toHaveValue('Описание для шаблона');
});

test('navigation groups collapse with dependencies inside the project dictionary', async ({ page }) => {
  await openDemoProject(page);
  const menu = page.locator('aside').first();
  const templates = menu.getByRole('button', { name: 'Шаблоны', exact: true });
  await expect(templates).toHaveAttribute('aria-expanded', 'false');
  await expect(menu.getByRole('link', { name: 'Шаблоны ответов', exact: true })).toBeHidden();
  const groups = menu.locator('button[aria-controls^="nav-group-"]');
  await expect(groups).toHaveText(['Словарь проекта', 'Шаблоны']);
  await expect(menu.locator('#nav-group-dictionary').getByRole('link', { name: 'Зависимости', exact: true })).toBeVisible();
  for (const name of ['Словарь проекта']) {
    const group = menu.getByRole('button', { name, exact: true });
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await group.press('Enter');
    await expect(group).toHaveAttribute('aria-expanded', 'true');
  }
  await templates.click();
  await expect(templates).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('link', { name: 'Шаблоны ответов', exact: true }).locator('svg')).toHaveClass(/lucide-files/);
  await expect(menu.getByRole('link', { name: 'Шаблоны сценариев', exact: true }).locator('svg')).toHaveClass(/lucide-panels-top-left/);
  await page.screenshot({ path: 'test-results/navigation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.locator('nav[aria-label="Основная навигация"]').last();
  await expect(mobile.getByRole('button', { name: 'Связи', exact: true })).toHaveCount(0);
  await mobile.getByRole('button', { name: 'Словарь', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Зависимости/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/navigation-mobile.png', fullPage: true });
  await page.getByRole('menuitem', { name: /Зависимости/ }).click();
  await expect(page).toHaveURL(/dependencies$/);

});

test('empty template lists always have a collapse control and fit desktop and mobile', async ({ page }) => {
  const pid = await openDemoProject(page);
  for (const section of ['templates/responses', 'templates/scenarios']) {
    await gotoSection(page, pid, section);
    const hide = page.getByRole('button', { name: 'Скрыть список', exact: true });
    await expect(hide).toBeVisible();
    await hide.click();
    await expect(page.getByRole('button', { name: 'Развернуть меню и список', exact: true })).toBeVisible();
    await expect(hide).toBeHidden();
    await page.getByRole('button', { name: 'Развернуть меню и список', exact: true }).click();
    await expect(hide).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/templates-review/templates-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Новый шаблон сценария', exact: true }).first().click();
  await page.screenshot({ path: 'test-results/templates-review/create-template-desktop.png', fullPage: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Шаблоны', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Шаблоны', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Шаблоны ответов', exact: true }).click();
  await expect(page.getByText('Шаблонов ответов пока нет', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/templates-review/templates-mobile.png', fullPage: true });
});
