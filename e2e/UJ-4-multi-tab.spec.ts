import { expect, test, type Page } from '@playwright/test';
async function createFirstAdmin(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Логин' }).fill('admin');
  await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('password-1');
  await page.getByRole('textbox', { name: 'Повторите пароль' }).fill('password-1');
  await page.getByRole('button', { name: 'Создать и войти' }).click();
  await expect(page.getByRole('button', { name: /Профиль: admin/ }).first()).toBeVisible();
}

async function call(page: Page, method: string, url: string, body?: unknown, expected?: unknown) {
  return page.evaluate(async ({ method, url, body, expected }) => {
    const path = '/src/lib/backend.ts';
    const backend = await import(/* @vite-ignore */ path);
    await backend.ensureBackend();
    return backend.request(method, url, body, expected ? { expected } : undefined);
  }, { method, url, body, expected });
}
async function setup(page: Page) {
  await createFirstAdmin(page);
  const project = await call(page, 'POST', '/api/projects', { name: 'Несколько вкладок' });
  const pid = project.body.id;
  const first = await call(page, 'POST', `/api/projects/${pid}/scenarios`, { name: 'Первый' });
  const second = await call(page, 'POST', `/api/projects/${pid}/scenarios`, { name: 'Второй' });
  return { pid, first: first.body.id, second: second.body.id };
}
async function editor(page: Page, pid: number, sid: number) {
  await page.goto(`/?editor=${sid}#/p/${pid}/scenarios/${sid}/general`);
  await expect(page.getByRole('textbox', { name: 'Название сценария', exact: true })).toBeVisible();
}
const name = (page: Page) => page.getByRole('textbox', { name: 'Название сценария', exact: true });

test('две вкладки: параллельные изменения разных сценариев переживают перезагрузку', async ({ page, context }) => {
  const { pid, first, second } = await setup(page);
  const other = await context.newPage();
  await Promise.all([editor(page, pid, first), editor(other, pid, second)]);
  await Promise.all([name(page).fill('Первый изменён'), name(other).fill('Второй изменён')]);
  await expect.poll(async () => (await call(page, 'GET', `/api/scenarios/${first}`)).body.name).toBe('Первый изменён');
  await expect.poll(async () => (await call(other, 'GET', `/api/scenarios/${second}`)).body.name).toBe('Второй изменён');
  await Promise.all([page.reload(), other.reload()]);
  await expect(name(page)).toHaveValue('Первый изменён');
  await expect(name(other)).toHaveValue('Второй изменён');
});

test('чистая форма получает изменения из другой вкладки', async ({ page, context }) => {
  const { pid, first } = await setup(page);
  const other = await context.newPage();
  await Promise.all([editor(page, pid, first), editor(other, pid, first)]);
  await name(page).fill('Обновлено в первой');
  await expect(name(other)).toHaveValue('Обновлено в первой');
  await name(other).fill('Обновлено во второй');
  await expect(name(page)).toHaveValue('Обновлено во второй');
});

test('конфликт сохраняет черновик и позволяет явно выбрать версию', async ({ page, context }, testInfo) => {
  const { pid, first } = await setup(page);
  const other = await context.newPage();
  await Promise.all([editor(page, pid, first), editor(other, pid, first)]);
  await other.clock.install();
  await name(other).fill('Мой черновик');
  const old = (await call(page, 'GET', `/api/scenarios/${first}`)).body;
  expect((await call(page, 'PUT', `/api/scenarios/${first}`, { ...old, name: 'Чужая версия' }, old)).status).toBe(200);
  await other.clock.runFor(1500);
  const alert = other.getByRole('alert').filter({ hasText: 'Автосохранение приостановлено' });
  await expect(alert).toBeVisible();
  await expect(name(other)).toHaveValue('Мой черновик');
  expect((await call(page, 'GET', `/api/scenarios/${first}`)).body.name).toBe('Чужая версия');
  await other.screenshot({ path: testInfo.outputPath('conflict-desktop.png') });
  await other.setViewportSize({ width: 390, height: 844 });
  await other.screenshot({ path: testInfo.outputPath('conflict-mobile.png') });
  await expect(other.getByRole('button', { name: 'Сохранить мой черновик поверх' })).toBeVisible();
  await other.getByRole('button', { name: 'Сохранить мой черновик поверх' }).click();
  await expect(alert).toHaveCount(0);
  expect((await call(page, 'GET', `/api/scenarios/${first}`)).body.name).toBe('Мой черновик');

  await name(other).fill('Второй черновик');
  const latest = (await call(page, 'GET', `/api/scenarios/${first}`)).body;
  await call(page, 'PUT', `/api/scenarios/${first}`, { ...latest, name: 'Сохранённая версия' }, latest);
  await other.clock.runFor(1500);
  await expect(alert).toBeVisible();
  await other.getByRole('button', { name: 'Загрузить сохранённую версию' }).click();
  await expect(name(other)).toHaveValue('Сохранённая версия');
  await expect(alert).toHaveCount(0);
  await name(other).fill('Правка после разрешения');
  await other.clock.runFor(1500);
  await expect.poll(async () => (await call(page, 'GET', `/api/scenarios/${first}`)).body.name).toBe('Правка после разрешения');
});

test('устаревшая версия отвергается, даже после фонового чтения; удаление тоже конфликт', async ({ page, context }) => {
  const { first } = await setup(page);
  const other = await context.newPage();
  await other.goto('/');
  const url = `/api/scenarios/${first}`;
  const original = (await call(other, 'GET', url)).body;
  await call(page, 'PUT', url, { ...original, description: 'Новая правка' }, original);
  const current = (await call(other, 'GET', url)).body;
  const conflict = await call(other, 'PUT', url, { ...original, name: 'Устаревшая правка' }, original);
  expect(conflict.status).toBe(409);
  expect(conflict.body.details.current).toEqual(current);
  await call(page, 'DELETE', url);
  const deleted = await call(other, 'PUT', url, original, original);
  expect(deleted.status).toBe(409);
  expect(deleted.body.details.current).toBeNull();
});

test('ошибка записи не сообщает об успешном сохранении и не меняет базу', async ({ page }) => {
  const { first } = await setup(page);
  const result = await page.evaluate(async (sid) => {
    const path = '/src/lib/backend.ts';
    const backend = await import(/* @vite-ignore */ path);
    const url = `/api/scenarios/${sid}`;
    const old = (await backend.request('GET', url)).body;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };
    let error = '';
    try { await backend.request('PUT', url, { ...old, name: 'Не записано' }, { expected: old }); }
    catch (e) { error = (e as Error).message; }
    finally { IDBObjectStore.prototype.put = put; }
    const current = (await backend.request('GET', url)).body;
    return { error, unchanged: JSON.stringify(old) === JSON.stringify(current) };
  }, first);
  expect(result.error).toContain('Storage full');
  expect(result.unchanged).toBe(true);
});



test('удаление в другой вкладке оставляет открытый черновик доступным для скачивания', async ({ page, context }) => {
  const { pid, first } = await setup(page);
  const other = await context.newPage();
  await Promise.all([editor(page, pid, first), editor(other, pid, first)]);
  await other.clock.install();
  await name(other).fill('Несохранённый черновик удалённого');
  await call(page, 'DELETE', `/api/scenarios/${first}`);
  await expect(other.getByText('Сценарий удалён в другой вкладке', { exact: true })).toBeVisible();
  await expect(name(other)).toHaveValue('Несохранённый черновик удалённого');
  const download = other.waitForEvent('download');
  await other.getByRole('button', { name: 'Скачать черновик' }).click();
  expect((await download).suggestedFilename()).toContain('черновик.json');
});

test('ручная история сценария тоже защищена от перезаписи из другой вкладки', async ({ page, context }) => {
  const { pid, first } = await setup(page);
  const other = await context.newPage();
  await other.goto(`/?editor=${first}#/p/${pid}/scenarios/${first}/history`);
  await expect(other.getByRole('region', { name: 'История изменений сценария', exact: true })).toBeVisible();
  await other.clock.install();
  await other.getByRole('button', { name: 'Добавить', exact: true }).click();
  await other.getByRole('textbox', { name: 'Задача, строка 1', exact: true }).fill('Моя задача');
  const url = `/api/scenarios/${first}/changelog`;
  const original = (await call(page, 'GET', url)).body;
  await call(page, 'PUT', url, { rows: [{ date: '', task: 'Чужая задача', author: '', description: '' }] }, original);
  await other.clock.runFor(1500);
  await expect(other.getByText('История изменений обновлена в другой вкладке', { exact: true })).toBeVisible();
  await expect(other.getByRole('textbox', { name: 'Задача, строка 1', exact: true })).toHaveValue('Моя задача');
  await other.getByRole('button', { name: 'Сохранить мои строки поверх', exact: true }).click();
  expect((await call(page, 'GET', url)).body[0].task).toBe('Моя задача');
});
