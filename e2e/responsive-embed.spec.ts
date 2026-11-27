import { expect, test } from '@playwright/test';

const demoRoute = '/#/p/1/scenarios/1';

test('compact portfolio iframe preserves scenario list and fits its visible width', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(demoRoute);
  await expect(page.locator('aside.w-60')).toBeVisible();

  await page.goto('/');
  await page.evaluate((src) => {
    const frame = document.createElement('div');
    frame.id = 'portfolio-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1236px;height:900px;overflow:hidden';
    const iframe = document.createElement('iframe');
    iframe.id = 'compact-demo';
    iframe.title = 'Compact demo';
    iframe.style.cssText = 'display:block;width:100%;height:111.111%;zoom:.9;border:0';
    iframe.src = src;
    frame.append(iframe);
    document.body.append(frame);
  }, demoRoute);

  const geometry = await page.locator('#compact-demo').evaluate((iframe) => ({
    frame: iframe.getBoundingClientRect().width,
    container: iframe.parentElement!.getBoundingClientRect().width,
  }));
  expect(geometry.frame).toBeLessThanOrEqual(geometry.container);

  const embeddedApp = page.frameLocator('#compact-demo');
  await expect(embeddedApp.locator('aside.w-16')).toBeVisible();
  await expect(embeddedApp.getByText('SC_LIGHT', { exact: true }).first()).toBeVisible();
  const embeddedWidth = await embeddedApp.locator('body').evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(embeddedWidth.viewport).toBeLessThanOrEqual(1600);
  expect(embeddedWidth.document).toBeLessThanOrEqual(embeddedWidth.viewport);
  await expect(embeddedApp.locator('aside.w-60')).toHaveCount(0);
});
