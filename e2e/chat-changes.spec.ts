import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { openDemo, createViaDialog } from './helpers';

const node = (page: import('@playwright/test').Page, name: string) => page.locator('.react-flow__node').filter({ has: page.getByText(name, { exact: true }) });

test('правки чата: копирование, сочетания без дублей и панель свойств', async ({ page }) => {
  await openDemo(page, 'scenarios/1/logic');
  await expect(page.getByRole('button', { name: 'Расставить', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Вписать', exact: true })).toHaveCount(0);
  await node(page, 'ST_LIGHT_ON').click();
  await expect(page.getByRole('button', { name: 'Закрыть панель', exact: true })).toHaveCount(0);
  const divider = page.getByRole('separator', { name: 'Ширина панели свойств' });
  await divider.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '306');
  await page.getByRole('button', { name: 'Дублировать состояние' }).click();
  await expect(node(page, 'ST_LIGHT_ON_2')).toBeVisible();
  await expect(page.getByLabel('Имя состояния')).toHaveValue('ST_LIGHT_ON_2');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(node(page, 'ST_LIGHT_ON_2')).toHaveCount(0);
  await page.getByRole('button').and(page.getByTitle(/DEP_HOME_MODE=night/)).click();
  const create = page.getByRole('button', { name: /^Создать состояния для всех сочетаний условий [(][0-9]+[)]$/ });
  const count = Number((await create.innerText()).split('(').at(-1)!.replace(')', ''));
  expect(count).toBeGreaterThan(0);
  const before = await page.locator('.react-flow__node').count();
  await create.click();
  await expect(page.locator('.react-flow__node')).toHaveCount(before + count);
  await expect(page.getByRole('button', { name: 'Создать состояния для всех сочетаний условий (0)', exact: true })).toBeDisabled();
});

test('правки чата: развёрнутые блоки и SVG используют S-маркеры и разделы условий', async ({ page }, testInfo) => {
  await openDemo(page, 'scenarios/1/logic');
  await page.getByRole('button', { name: 'Развернуть блоки', exact: true }).click();
  await expect(node(page, 'VA_ACTIVATION').getByText('S1', { exact: true })).toBeVisible();
  await expect(node(page, 'ST_LIGHT_ON')).toContainText('ДЕЙСТВИЕ');
  const edge = page.getByRole('button').and(page.getByTitle(/DEP_HOME_MODE=night/));
  await expect(edge).toContainText('ИНТЕНТ');
  await expect(edge).toContainText('УСЛОВИЯ');
  await expect(edge.locator('svg line')).toHaveCount(2);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const svg = await readFile((await (await downloading).path())!, 'utf8');
  expect(svg).toContain('>S1</text>');
  expect(svg).toContain('>ИНТЕНТ</text>');
  await page.screenshot({ path: testInfo.outputPath('main-expanded-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Свернуть блоки', exact: true }).click();
  await page.getByRole('button', { name: 'Развернуть блоки', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('main-expanded-mobile.png'), fullPage: true });
});

test('правки чата: значения и описания зависимостей наследуются и блокируются', async ({ page }) => {
  await openDemo(page, 'dependencies');
  await page.getByRole('link', { name: /^DEP_HOME_MODE/ }).click();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('DEP_HOME_MODE');
  await page.getByLabel('Описание зависимости').fill('Внешний режим дома');
  await expect(page.getByRole('status', { name: 'Сохранено' })).toBeVisible();
  await page.goto('/#/p/1/scenarios');
  await createViaDialog(page, 'Новый сценарий', 'SC_CHAT_DEPS');
  await expect(page.getByLabel('Название сценария')).toHaveValue('SC_CHAT_DEPS');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByLabel('Название зависимости').fill('DEP_HOME');
  await page.getByRole('option', { name: 'DEP_HOME_MODE', exact: true }).click();
  await expect(page.getByLabel('Описание зависимости')).toHaveValue('Внешний режим дома');
  await expect(page.getByLabel('Описание зависимости')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('group', { name: 'Значения зависимости' })).toContainText('night');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByLabel('Название зависимости').last().fill('DEP_CREATED_IN_CHAT');
  await page.getByLabel('Описание зависимости').last().fill('Создана в сценарии');
  await expect(page.getByRole('link', { name: 'В справочнике →', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'В справочнике →', exact: true }).click();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('DEP_CREATED_IN_CHAT');
  await expect(page.getByLabel('Описание зависимости')).toHaveValue('Создана в сценарии');
});

test('правки чата: сортировка, глобальные интенты и дата в экспорте', async ({ page }) => {
  await openDemo(page, 'scenarios/1/intents');
  const list = page.getByLabel('Интенты сценария');
  await expect(list.getByRole('switch', { name: / включён$/ }).first()).toBeVisible();
  const readNames = async () => (await list.getByRole('switch', { name: / включён$/ }).all()).map(async (item) => (await item.getAttribute('aria-label'))!.replace(/^Интент | включён$/g, ''));
  const original = await Promise.all(await readNames());
  await list.getByRole('button', { name: 'Сортировать: Интент', exact: true }).click();
  await expect.poll(async () => Promise.all(await readNames())).toEqual([...original].sort(new Intl.Collator('ru', { numeric: true, sensitivity: 'base' }).compare));
  await page.getByRole('button', { name: 'Интент', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Интент Новый интент глобальный', exact: true })).toBeChecked();
  await page.getByRole('tab', { name: /^История изменений/ }).click();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByLabel('Дата, строка 1', { exact: true }).fill('2026-11-02');
  await page.getByLabel('Задача, строка 1', { exact: true }).fill('CHAT-DATE');
  await expect(page.getByRole('status', { name: 'Сохранено' })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт .docx', exact: true }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await downloading).path())!));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('2026-11-02');
  expect(xml).toContain('CHAT-DATE');
});
