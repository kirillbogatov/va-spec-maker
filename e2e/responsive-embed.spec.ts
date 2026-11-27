import { expect, test } from '@playwright/test';

const demoRoute = '/#/p/1/scenarios/1';

test('navigation collapses in a compact embedded demo and stays expanded in the app', async ({ page }) => {
  await page.setViewportSize({ width: 1236, height: 900 });
  await page.goto(demoRoute);
  await expect(page.locator('aside.w-60')).toBeVisible();

  await page.goto('/');
  await page.evaluate((src) => {
    const iframe = document.createElement('iframe');
    iframe.id = 'compact-demo';
    iframe.title = 'Compact demo';
    iframe.style.cssText = 'position:fixed;inset:0;width:1236px;height:900px;border:0;z-index:9999';
    iframe.src = src;
    document.body.append(iframe);
  }, demoRoute);

  const embeddedApp = page.frameLocator('#compact-demo');
  await expect(embeddedApp.locator('aside.w-16')).toBeVisible();
  await expect(embeddedApp.getByText('SC_LIGHT', { exact: true }).first()).toBeVisible();
  const embeddedWidth = await embeddedApp.locator('body').evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(embeddedWidth.document).toBeLessThanOrEqual(embeddedWidth.viewport);
  await expect(embeddedApp.locator('aside.w-60')).toHaveCount(0);
});
