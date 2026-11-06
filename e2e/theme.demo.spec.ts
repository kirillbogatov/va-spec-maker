import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openDemo } from './helpers';
async function openDemoProject(page: import('@playwright/test').Page) {
  await openDemo(page);
  return 1;
}

test('тема сохраняется после перезагрузки, действует на все экраны и синхронизируется между вкладками', async ({ page, context }) => {
  const projectId = await openDemoProject(page);
  await page.goto(`/#/p/${projectId}/settings`);
  const group = page.getByRole('radiogroup', { name: 'Тема интерфейса', exact: true });
  const light = group.getByRole('radio', { name: 'Светлая', exact: true });
  const dark = group.getByRole('radio', { name: 'Темная', exact: true });
  await expect(group.getByRole('radio', { name: 'Системная', exact: true })).toBeChecked();
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(page.getByText('Тема интерфейса для всех проектов.', { exact: true })).toHaveCount(0);
  await dark.locator('..').click();
  await expect(dark).toBeChecked();
  await expect(dark.locator('..').locator('span')).toHaveCSS('background-color', 'rgb(43, 85, 224)');
  await expect(dark.locator('..').locator('span')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 17, 23)');
  await page.reload();
  await expect(dark).toBeChecked();

  const other = await context.newPage();
  await other.goto('/#/');
  await expect(other.locator('html')).toHaveClass(/dark/);
  await expect(other.getByText('Демо: умный дом').first()).toBeVisible();

  // Клавиатурное переключение работает и обновляет уже открытую соседнюю вкладку.
  await dark.focus();
  await dark.press('ArrowLeft');
  await expect(light).toBeChecked();
  await expect(other.locator('html')).not.toHaveClass(/dark/);
  await light.locator('..').hover();
  await expect(light.locator('..').locator('span')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.reload();
  await expect(light).toBeChecked();
  await other.close();
});

test('развёрнутые блоки схемы следуют тёмной теме, экспорт SVG сохраняет белый фон', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('specmaker.theme', 'dark'));
  const projectId = await openDemoProject(page);
  await page.goto(`/#/p/${projectId}/scenarios`);
  await page.waitForURL(/scenarios\/\d+/);
  await page.getByRole('tab', { name: /^Логика/ }).click();
  await page.getByRole('button', { name: 'Развернуть блоки', exact: true }).click();
  const rect = page.locator('.react-flow__node svg rect').first();
  await expect(rect).toHaveCSS('fill', 'rgb(22, 27, 34)');
  await page.screenshot({ path: testInfo.outputPath('dark-scheme-desktop.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const svg = await readFile((await (await downloadPromise).path())!, 'utf8');
  expect(svg).toContain('fill="#fff"');
  expect(svg).not.toContain('var(--');
});

test('переключатель работает, даже когда сохранение темы запрещено браузером', async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'specmaker.theme') throw new DOMException('Storage is unavailable', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'specmaker.theme') throw new DOMException('Storage is unavailable', 'SecurityError');
      set.call(this, key, value);
    };
  });
  const projectId = await openDemoProject(page);
  await page.goto(`/#/p/${projectId}/settings`);
  const group = page.getByRole('radiogroup', { name: 'Тема интерфейса', exact: true });
  await group.getByRole('radio', { name: 'Темная', exact: true }).locator('..').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await group.getByRole('radio', { name: 'Светлая', exact: true }).locator('..').click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('системная тема сохраняется и автоматически следует настройке устройства', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const projectId = await openDemoProject(page);
  await page.goto(`/#/p/${projectId}/settings`);
  const group = page.getByRole('radiogroup', { name: 'Тема интерфейса', exact: true });
  const system = group.getByRole('radio', { name: 'Системная', exact: true });
  await system.locator('..').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(system).toBeChecked();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(system).toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(system).toBeChecked();

  await group.getByRole('radio', { name: 'Светлая', exact: true }).locator('..').click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await group.getByRole('radio', { name: 'Темная', exact: true }).locator('..').click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass(/dark/);
});
