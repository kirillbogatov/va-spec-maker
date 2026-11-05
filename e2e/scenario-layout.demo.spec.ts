import { expect, test } from '@playwright/test';

for (const width of [1920, 3440, 390]) {
  test(`scenario tabs stay centered and fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#/p/1/scenarios/1');
    await expect(page.getByRole('textbox', { name: 'Название сценария' })).toBeVisible();
    for (const tab of ['Общая информация', 'Интенты', 'Промпты', 'Предпросмотр', 'История изменений']) {
      const activeTab = page.getByRole('tab', { name: tab === 'Общая информация' ? /^(Общая информация|Общее)$/ : new RegExp(`^${tab}( \\d+)?$`) });
      await activeTab.click();
      await expect(activeTab).toHaveAttribute('aria-selected', 'true');
      const title = page.getByRole('textbox', { name: 'Название сценария' });
      const header = title.locator('xpath=ancestor::header');
      const column = header.locator('xpath=following-sibling::div[contains(@class,"overflow-y-auto")]');
      const inner = column.locator(':scope > div').first();
      await expect(column).toBeVisible();
      const boxes = await inner.evaluate((element) => {
        const inner = element.getBoundingClientRect();
        const outer = element.parentElement!.getBoundingClientRect();
        return { width: inner.width, available: outer.width, offset: Math.abs(inner.x + inner.width / 2 - outer.x - outer.width / 2) };
      });
      expect(boxes.offset).toBeLessThan(2);
      expect(boxes.width).toBeGreaterThanOrEqual(boxes.available * 0.6);
      expect(boxes.width).toBeLessThanOrEqual(boxes.available);
      if (width > 1500) expect(boxes.width).toBeLessThan(boxes.available * 0.95);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect(page.getByRole('textbox', { name: 'Название сценария' })).toHaveCSS('font-size', '20px');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
      const surfaces = await page.evaluate(() => {
        const header = document.querySelector('header');
        const nav = window.innerWidth >= 768 ? document.querySelector('aside') : [...document.querySelectorAll('nav[aria-label="Основная навигация"]')].find((el) => el.getBoundingClientRect().height > 0);
        return [header, nav].map((el) => el && getComputedStyle(el).backgroundColor);
      });
      expect(surfaces[0]).toBe(surfaces[1]);
      expect(surfaces[0]).toBe(theme === 'dark' ? 'rgb(1, 4, 9)' : 'rgb(255, 255, 255)');
      await page.screenshot({ path: `test-results/scenario-${theme}-${width}.png` });
    }
  });
}
