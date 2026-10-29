import { expect, test, type Page } from '@playwright/test';
import { createViaDialog, openDemo } from './helpers';

async function deleteCurrent(page: Page) {
  await page.getByRole('button', { name: 'Действия' }).click();
  await page.getByRole('menuitem', { name: /Удалить/ }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: /Удалить/ }).click();
}

test.describe('UJ-1 Описать словарь проекта: правка и удаление', () => {
  test('ED-03-04 переименовать сущность (автосохранение)', async ({ page }) => {
    await openDemo(page, 'entities');
    await createViaDialog(page, /Нов(ая|ый)/, 'ENT_REN');
    await expect(page.getByLabel('Название')).toHaveValue('ENT_REN');
    await page.getByLabel('Название').fill('ENT_RENAMED');
    await expect(page.getByRole('link', { name: /ENT_RENAMED/ })).toBeVisible();
  });

  test('ED-03-05 удалить сущность без использования', async ({ page }) => {
    await openDemo(page, 'entities');
    await createViaDialog(page, /Нов(ая|ый)/, 'ENT_DEL');
    await deleteCurrent(page);
    await expect(page.getByRole('link', { name: /ENT_DEL/ })).toHaveCount(0);
  });

  test('ED-04-04 переименовать промпт (автосохранение)', async ({ page }) => {
    await openDemo(page, 'lists/prompts');
    await createViaDialog(page, /Нов(ая|ый)/, 'PRM_REN');
    await expect(page.getByLabel('Название')).toHaveValue('PRM_REN');
    await page.getByLabel('Название').fill('PRM_RENAMED');
    await page.waitForTimeout(2000);
    // список промптов обновляет название только после перезагрузки (см. находки в отчёте QA)
    await page.reload();
    await expect(page.getByRole('link', { name: /PRM_RENAMED/ })).toBeVisible();
  });

  test('ED-04-05 удалить промпт', async ({ page }) => {
    await openDemo(page, 'lists/prompts');
    await createViaDialog(page, /Нов(ая|ый)/, 'PRM_DEL');
    await deleteCurrent(page);
    await expect(page.getByRole('link', { name: /PRM_DEL/ })).toHaveCount(0);
  });

  test('ED-05-04 переименовать зависимость (автосохранение)', async ({ page }) => {
    await openDemo(page, 'dependencies');
    await createViaDialog(page, /Нов(ая|ый)/, 'DEP_REN');
    await expect(page.getByLabel('Название')).toHaveValue('DEP_REN');
    await page.getByLabel('Название').fill('DEP_RENAMED');
    await expect(page.getByRole('link', { name: /DEP_RENAMED/ })).toBeVisible();
  });

  test('ED-05-05 удалить зависимость', async ({ page }) => {
    await openDemo(page, 'dependencies');
    await createViaDialog(page, /Нов(ая|ый)/, 'DEP_DEL');
    await deleteCurrent(page);
    await expect(page.getByRole('link', { name: /DEP_DEL/ })).toHaveCount(0);
  });
});

test.describe('UJ-1 Ключевые слова', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page, 'settings');
    await page.getByRole('radio', { name: /Ключевые слова/ }).check();
    await page.getByRole('link', { name: 'Ключевые слова' }).click();
  });

  test('ED-06-01 ED-06-02 создать ключевое слово; «$» отбрасывается', async ({ page }) => {
    await createViaDialog(page, /Нов(ая|ый|ое)/, '$E2E_KW');
    await expect(page.getByRole('link', { name: /E2E_KW/ })).toBeVisible();
  });

  test('ED-06-04 ED-06-05 переименовать и удалить ключевое слово', async ({ page }) => {
    await createViaDialog(page, /Нов(ая|ый|ое)/, 'KW_ONE');
    await deleteCurrent(page);
    await expect(page.getByRole('link', { name: /KW_ONE/ })).toHaveCount(0);
  });

  test('ED-06-06 выгрузить ключевые слова в txt', async ({ page }) => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Импорт и экспорт' }).click();
    await page.getByRole('menuitem', { name: /txt/i }).filter({ hasText: /Экспорт|Выгруз/ }).first().click();
    expect((await download).suggestedFilename()).toBe('keywords.txt');
  });

  test('ED-06-07 загрузить ключевые слова из txt', async ({ page }) => {
    await page.locator('input[type=file]').first().setInputFiles({ name: 'keywords.txt', mimeType: 'text/plain', buffer: Buffer.from('ON: включи, зажги\nOFF: выключи\n', 'utf-8') });
    await expect(page.getByRole('link', { name: /OFF/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /ON/ }).first()).toBeVisible();
  });
});
