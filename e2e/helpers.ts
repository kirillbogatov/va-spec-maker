import { expect, type Page } from '@playwright/test';

export const DEMO = 'Демо: умный дом';

/** Открывает демо-проект: в демо-режиме вход не нужен, данные живут в сессии вкладки. */
export async function openDemo(page: Page, route = 'scenarios/1') {
  await page.goto(`/#/p/1/${route}`);
  await expect(page.getByText(DEMO).first()).toBeVisible();
}

/** Диалог создания объекта (название и кнопка «Создать»). */
export async function createViaDialog(page: Page, opener: string | RegExp, name: string) {
  await page.getByRole('button', { name: opener }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Название' }).fill(name);
  await dialog.getByRole('button', { name: 'Создать' }).click();
}
