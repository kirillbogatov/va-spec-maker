import { expect, test, type Page } from '@playwright/test';

async function scenario(page: Page) {
  return page.evaluate(async () => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const backend = await load('/src/lib/backend.ts');
    return (await backend.request('GET', '/api/scenarios/1')).body;
  });
}

test('свойства вкладки сохраняют общие предусловия отдельно от переходов', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1/logic');
  await expect(page.locator('.react-flow')).toHaveCSS('opacity', '1');
  const before = await scenario(page);
  const tablist = page.getByRole('tablist', { name: 'Вкладки сценария', exact: true });
  await tablist.getByRole('tab').first().click();
  const name = page.getByLabel('Название вкладки', { exact: true });
  const description = page.getByLabel('Описание вкладки', { exact: true });
  await expect(name).toHaveCSS('border-top-color', 'rgb(207, 213, 223)');
  await expect(description).toHaveCSS('border-top-width', '1px');
  await name.fill('Основная с предусловиями');
  await description.fill('Описание всей вкладки');
  const preconditions = page.getByRole('region', { name: 'Предусловия', exact: true });
  await preconditions.getByRole('button', { name: 'зависимость', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const value = dialog.getByLabel('Значение', { exact: true });
  if (await value.evaluate((el) => el.tagName) === 'INPUT') await value.fill('ready');
  else {
    await value.click();
    await page.getByRole('option').first().click();
  }
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await preconditions.getByRole('button', { name: 'своё', exact: true }).click();
  await preconditions.getByLabel('Своё условие 1', { exact: true }).fill('Пользователь авторизован');
  await preconditions.getByRole('radio', { name: 'Любое из условий', exact: true }).check();
  await expect.poll(async () => {
    const part = (await scenario(page)).parts[0];
    return { name: part.name, description: part.description, count: part.preconditions.length, text: part.precondition, mode: part.precond_mode };
  }).toEqual({ name: 'Основная с предусловиями', description: 'Описание всей вкладки', count: 1, text: 'Пользователь авторизован', mode: 'any' });
  const conditionsOf = (doc: any) => doc.parts[0].steps.map((step: any) => JSON.stringify([
    step.kind, step.intent_id, step.condition,
    step.conditions.map((condition: any) => ({ ...condition, op: condition.op ?? '=' })),
  ])).sort();
  expect(conditionsOf(await scenario(page))).toEqual(conditionsOf(before));
  await page.getByRole('button', { name: 'Добавить вкладку', exact: true }).click();
  await expect(preconditions.getByLabel('Своё условие 1', { exact: true })).toHaveCount(0);
  await expect(preconditions.getByRole('button', { name: 'Изменить условие 1', exact: true })).toHaveCount(0);
  await name.fill('Вторая вкладка');
  await expect.poll(async () => (await scenario(page)).parts[1]?.name).toBe('Вторая вкладка');
  await page.reload();
  await tablist.getByRole('tab', { name: 'Основная с предусловиями', exact: true }).click();
  await expect(description).toHaveValue('Описание всей вкладки');
  await expect(preconditions.getByLabel('Своё условие 1', { exact: true })).toHaveValue('Пользователь авторизован');
  await expect(preconditions.getByRole('radio', { name: 'Любое из условий', exact: true })).toBeChecked();
  const markdown = await page.evaluate(async () => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const { api } = await load('/src/lib/api.ts');
    return await api.preview(1, 'ru', 'phrases');
  });
  expect(markdown).toContain('Основная с предусловиями');
  expect(markdown).toContain('Описание всей вкладки');
  expect(markdown).toContain('Предусловия');
  expect(markdown).toContain('Пользователь авторизован');
  expect(markdown.indexOf('Пользователь авторизован')).toBeLessThan(markdown.indexOf('Вторая вкладка'));
  await page.screenshot({ path: `${process.env.TEMP}/va-preconditions-${process.env.QA_PORT}.png` });
  await page.setViewportSize({ width: 375, height: 812 });
  await preconditions.scrollIntoViewIfNeeded();
  await expect(preconditions.getByLabel('Своё условие 1', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${process.env.TEMP}/va-preconditions-mobile-${process.env.QA_PORT}.png` });
});
