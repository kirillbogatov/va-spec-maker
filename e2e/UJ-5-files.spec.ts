import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

test.describe('UJ-5 Сохранить и перенести данные: файлы', () => {
  test('ED-09-05 выгрузить справочник интентов в CSV', async ({ page }) => {
    await openDemo(page, 'lists/intents');
    await page.getByRole('button', { name: 'Импорт и экспорт' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Экспорт в CSV' }).click();
    expect((await download).suggestedFilename()).toBe('intents.csv');
  });

  test('ED-09-05 загрузить справочник промптов из CSV', async ({ page }) => {
    await openDemo(page, 'lists/prompts');
    await page.getByRole('button', { name: 'Импорт и экспорт' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Импорт из CSV' }).click();
    await (await chooser).setFiles({ name: 'prompts.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿name,answers\nPRM_FROM_CSV,Привет из CSV\n', 'utf-8') });
    await expect(page.getByRole('link', { name: /PRM_FROM_CSV/ })).toBeVisible();
  });

  test('ED-09-06 выгрузить схему сценария в SVG', async ({ page }) => {
    await openDemo(page, 'scenarios/1/logic');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /SVG/i }).first().click();
    expect((await download).suggestedFilename()).toMatch(/\.svg$/);
  });

  test('ED-01-07 импортировать проект из JSON-копии: выгрузка и обратная загрузка', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Действия с проектом/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Экспорт \(\.json\)/ }).click();
    const path = await (await download).path();
    await page.getByLabel('Файл копии проекта').setInputFiles(path);
    await expect(page.getByRole('heading', { name: /Демо: умный дом/ })).toHaveCount(2);
  });
});
