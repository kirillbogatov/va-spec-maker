import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function reloadPersisted(page: Page) {
  await expect(page.getByRole('status', { name: 'Сохранение…' })).toHaveCount(0);
  let previous: string | null = null;
  await expect.poll(async () => {
    const current = await page.evaluate(() => sessionStorage.getItem('va-demo-db'));
    const stable = !!current && current === previous;
    previous = current;
    return stable;
  }, { intervals: [400], timeout: 10_000 }).toBe(true);
  await page.reload();
}

test('Jira URL pasted into Task becomes a short editable link and survives reload', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1');
  await page.getByRole('tab', { name: 'История изменений', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Задача, строка 1', exact: true });
  await input.focus();
  const url = 'https://jira.example.com/browse/SPEC-123?focusedCommentId=42';
  await input.evaluate((element, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, url);
  const link = page.getByRole('link', { name: 'SPEC-123', exact: true });
  await expect(link).toHaveAttribute('href', url);
  await expect(input).toHaveCount(0);
  await reloadPersisted(page);
  await expect(link).toHaveAttribute('href', url);

  const editTask = page.getByRole('button', { name: 'Редактировать задачу', exact: true });
  const taskField = editTask.locator('..');
  await expect(taskField.locator('svg')).toHaveCount(0);
  await page.mouse.move(0, 0);
  const idleBackground = await taskField.evaluate((element) => getComputedStyle(element).backgroundColor);
  await link.hover();
  await expect.poll(() => taskField.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(idleBackground);
  const author = page.getByRole('textbox', { name: 'Автор, строка 1', exact: true });
  await author.hover();
  await expect.poll(() => author.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(idleBackground);
  await author.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const hoverBackground = await author.evaluate((element) => getComputedStyle(element).backgroundColor);
  await link.hover();
  await expect.poll(() => taskField.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(hoverBackground);
  await page.screenshot({ path: 'test-results/task-field-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(link).toBeVisible();
  await page.screenshot({ path: 'test-results/task-field-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.context().route('https://jira.example.com/**', (route) => route.fulfill({ body: 'Task page' }));
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(url);
  await popup.close();
  await expect(input).toHaveCount(0);

  await editTask.click({ position: { x: 2, y: 2 } });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`[SPEC-123](${url})`);
  await input.fill('https://jira.example.com/browse/SPEC-456');
  await input.press('Tab');
  await expect(page.getByRole('link', { name: 'SPEC-456', exact: true })).toHaveAttribute('href', 'https://jira.example.com/browse/SPEC-456');

  await editTask.focus();
  await editTask.press('Enter');
  await input.fill('Обычная задача');
  await input.press('Tab');
  await expect(input).toHaveValue('Обычная задача');
  await expect(page.getByRole('link', { name: 'SPEC-456', exact: true })).toHaveCount(0);
});
