import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page, atom: boolean) {
  await page.goto('/');
  return page.evaluate(async (atom) => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const { ensureBackend } = await load('/src/lib/backend.ts');
    await ensureBackend();
    const { api, req } = await load('/src/lib/api.ts');
    const p = await api.projects.create('History regression');
    if (!atom) localStorage.setItem(`intentMode:${p.id}`, 'keywords');
    const sections = ['intents', 'entities', 'prompts', 'dependencies', 'response-templates', ...(atom ? ['concepts', 'result-codes'] : ['keywords'])];
    for (const kind of sections) {
      const endpoint = kind === 'dependencies' ? 'dependency-dictionary' : kind;
      const created = await req('POST', `/api/projects/${p.id}/${endpoint}`, { name: `TEST_${kind}` });
      const current = await req('GET', `/api/${endpoint}/${created.id}`);
      await req('PUT', `/api/${endpoint}/${created.id}`, { ...current, name: `EDITED_${kind}` });
    }
    const s = await api.scenarios.create(p.id, 'Long names');
    const name = 'INT_' + 'LONG_NAME_'.repeat(20);
    await api.intents.create(s.id, name);
    return { pid: p.id, sid: s.id, name };
  }, atom);
}
const ATOM = false;

test('history opens from every directory menu and survives reload and mobile navigation', async ({ page }, info) => {
  const { pid } = await seed(page, ATOM);
  const sections = ['lists/intents', 'entities', 'lists/prompts', 'dependencies', 'templates/responses', ...(ATOM ? ['concepts', 'result-codes'] : ['lists/keywords'])];
  for (const section of sections) {
    await page.goto(`/#/p/${pid}/${section}`);
    await expect(page).toHaveURL(new RegExp(`${section}/[0-9]+$`));
    await page.getByRole('button', { name: /^(Импорт и экспорт|Действия справочника)$/ }).click();
    await page.getByRole('menuitem', { name: 'История изменений', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${section}/history$`));
    await expect(page.getByRole('heading', { name: 'История изменений', exact: true })).toBeVisible();
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'Дата изменения' })).toBeVisible();
    await expect(table.getByText(/Название: TEST_/)).toBeVisible();
    await expect(table.getByText('Элемент создан', { exact: true }).first()).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('history-desktop.png') });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'История изменений', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('history-mobile.png') });
});

test('new dependency has its first value input; long tokens stay within resized columns', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const { pid, sid, name } = await seed(page, ATOM);
  await page.goto(`/#/p/${pid}/scenarios/${sid}`);
  await page.getByRole('button', { name: 'Зависимость', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Значение 1', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Название зависимости').fill('NEW_DEP');
  await dialog.getByLabel('Значение 1', { exact: true }).fill('first');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: /^Интенты/ }).click();
  const table = page.getByRole('region', { name: 'Интенты сценария' });
  const token = table.getByTitle(name, { exact: true });
  await expect(token).toBeVisible();
  const handle = table.getByRole('separator', { name: /ширину колонки «Интент»/ });
  await handle.focus();
  for (let i = 0; i < 12; i++) await handle.press('ArrowLeft');
  const bounds = await token.evaluate((element) => {
    const token = element.getBoundingClientRect();
    const cell = element.parentElement!;
    const next = cell.nextElementSibling!.getBoundingClientRect();
    return { right: token.right, next: next.left, width: token.width };
  });
  expect(bounds.right).toBeLessThanOrEqual(bounds.next);
  expect(bounds.width).toBeLessThan(170);
  await page.screenshot({ path: info.outputPath('resized-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('resized-mobile.png') });
});


test('history waits for the current editor to save when opened immediately after an edit', async ({ page }) => {
  const { pid } = await seed(page, ATOM);
  await page.goto(`/#/p/${pid}/entities`);
  const name = page.getByLabel('Название', { exact: true });
  await expect(name).toHaveValue('EDITED_entities');
  await name.fill('JUST_CHANGED');
  await page.getByRole('button', { name: 'Импорт и экспорт', exact: true }).click();
  await page.getByRole('menuitem', { name: 'История изменений', exact: true }).click();
  await expect(page.getByRole('table').getByText('Название: EDITED_entities → JUST_CHANGED', { exact: true })).toBeVisible();
});
