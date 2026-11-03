import { expect, test } from '@playwright/test';

test('полноэкранная схема сохраняется при добавлении и переключении вкладок', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1/logic');
  await page.locator('button[title^="Развернуть схему"]').click();
  const expanded = page.locator('button[title^="Свернуть схему"]');
  await expect(expanded).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByRole('complementary', { name: 'Свойства', exact: true });
  await expect(panel.locator('..')).toHaveCSS('position', 'fixed');
  await page.getByRole('button', { name: 'Добавить вкладку', exact: true }).click();
  await expect(expanded).toHaveAttribute('aria-pressed', 'true');
  const tabs = page.getByRole('tablist', { name: 'Вкладки сценария', exact: true }).getByRole('tab');
  await tabs.first().click();
  await expect(expanded).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('..')).toHaveCSS('position', 'fixed');
  await tabs.last().click();
  await expect(expanded).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('button[title^="Развернуть схему"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.locator('..')).not.toHaveCSS('position', 'fixed');
});


test('новая вкладка показывает схему сразу в конечной позиции', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1/logic');
  await expect(page.locator('.react-flow')).toHaveCSS('opacity', '1');
  await page.locator('button[title^="Развернуть схему"]').click();
  await expect(page.getByRole('button', { name: 'Создать копию вкладки', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить вкладку', exact: true }).click();
  await page.getByRole('tablist', { name: 'Вкладки сценария', exact: true }).getByRole('tab').first().click();
  await page.getByRole('button', { name: 'Дублировать вкладку', exact: true }).click();
  await expect(page.locator('.react-flow')).toHaveCSS('opacity', '1');
  const transforms = await page.evaluate(async () => {
    const previous = document.querySelector('.react-flow');
    const tabs = document.querySelector('[role="tablist"][aria-label="Вкладки сценария"]');
    (tabs!.querySelector('[role="tab"]') as HTMLElement).click();
    const frames: string[] = [];
    for (let i = 0; i < 90 && frames.length < 20; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const flow = document.querySelector('.react-flow');
      const viewport = flow?.querySelector('.react-flow__viewport');
      if (flow && flow !== previous && viewport && getComputedStyle(flow).opacity === '1') {
        frames.push(getComputedStyle(viewport).transform);
      }
    }
    return frames;
  });
  expect(transforms.length).toBe(20);
  expect(new Set(transforms).size).toBe(1);
});


test('кнопка скрытия находится в списке, восстановление возвращает фокус', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1/logic');
  await expect(page.locator('.react-flow')).toHaveCSS('opacity', '1');
  const menu = page.locator('aside').first();
  await expect(page.getByRole('button', { name: /^(Свернуть|Развернуть) меню$/ })).toHaveCount(0);
  expect((await menu.boundingBox())!.width).toBe(240);
  const hide = page.getByRole('button', { name: 'Скрыть список', exact: true });
  await expect(page.locator('aside').filter({ has: hide })).toBeVisible();
  const canvas = page.getByRole('region', { name: 'Редактор схемы', exact: true });
  const before = await canvas.boundingBox();
  await hide.click();
  const restore = menu.getByRole('button', { name: 'Развернуть меню и список', exact: true });
  await expect(restore).toBeFocused();
  expect((await menu.boundingBox())!.width).toBe(64);
  await expect(page.locator('aside').filter({ has: hide })).toBeHidden();
  expect((await page.locator('main').first().boundingBox())!.x).toBe(64);
  await expect(menu.locator('a[title="Все проекты"]')).toHaveCount(0);
  await page.screenshot({ path: `${process.env.TEMP}/va-collapsed-qa-${process.env.QA_PORT}.png` });
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(before!.width);
  await restore.press('Enter');
  await expect(hide).toBeFocused();
  expect((await menu.boundingBox())!.width).toBe(240);
  expect((await canvas.boundingBox())!.y).toBe(before!.y);
  await page.screenshot({ path: `${process.env.TEMP}/va-list-qa-${process.env.QA_PORT}.png` });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(hide).toBeHidden();
  await expect(page.getByRole('button', { name: 'Назад к списку', exact: true })).toBeVisible();
});
