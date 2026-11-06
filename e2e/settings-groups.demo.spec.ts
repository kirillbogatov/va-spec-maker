import { expect, test } from '@playwright/test';

test('settings groups, system default and explicit theme persist on desktop and mobile', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/p/1/settings');
  await expect(page.getByRole('radio', { name: 'Системная', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const tabs = page.getByRole('tablist', { name: 'Разделы настроек' });
  for (const name of ['Внешний вид', 'Интенты и NLU', 'Спецификации']) {
    await tabs.getByRole('tab', { name, exact: true }).click();
    await expect(tabs.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(name);
  }
  await expect(page.getByRole('radiogroup', { name: 'Тема интерфейса' })).not.toBeVisible();
  const divider = page.getByRole('separator', { exact: true });
  await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
  await tabs.getByRole('tab', { name: 'Внешний вид', exact: true }).click();
  await tabs.getByRole('tab', { name: 'Внешний вид', exact: true }).press('ArrowDown');
  await expect(page.getByRole('tabpanel')).toHaveAccessibleName('Интенты и NLU');
  await tabs.getByRole('tab', { name: 'Спецификации', exact: true }).click();
  await page.getByRole('textbox', { name: 'Интенты', exact: true }).fill('KEPT_');
  await tabs.getByRole('tab', { name: 'Внешний вид', exact: true }).click();
  await tabs.getByRole('tab', { name: 'Спецификации', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Интенты', exact: true })).toHaveValue('KEPT_');
  await page.screenshot({ path: info.outputPath('settings-desktop-dark.png') });
  await tabs.getByRole('tab', { name: 'Внешний вид', exact: true }).click();
  await page.getByRole('radio', { name: 'Светлая', exact: true }).locator('..').click();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Светлая', exact: true })).toBeChecked();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.screenshot({ path: info.outputPath('settings-desktop-light.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('settings-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('configured prefixes are used in dictionaries and scenario creation, including templates', async ({ page }) => {
  await page.goto('/#/p/1/settings');
  await page.getByRole('tab', { name: 'Спецификации', exact: true }).click();
  for (const [label, prefix] of [['Интенты', 'XI_'], ['Промпты', 'XP_'], ['Зависимости', 'XD_']]) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(prefix);
    await page.getByRole('textbox', { name: label, exact: true }).blur();
  }
  await page.goto('/#/p/1/lists/intents');
  await page.getByRole('button', { name: /^(Добавить|Новый интент)$/ }).first().click();
  await expect(page.getByRole('dialog').getByLabel('Название', { exact: true })).toHaveValue('XI_');
  await page.getByRole('dialog').press('Escape');
  await page.goto('/#/p/1/scenarios');
  await page.getByRole('button', { name: 'Зависимость', exact: true }).click();
  await expect(page.getByLabel('Название зависимости', { exact: true })).toHaveValue('XD_');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('tab', { name: /^Интенты/ }).click();
  await page.getByRole('button', { name: 'Интент', exact: true }).click();
  await expect(page.getByLabel('Название интента', { exact: true })).toHaveValue('XI_Новый интент');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Интент', exact: true }).click();
  await expect(page.getByLabel('Название интента', { exact: true })).toHaveValue('XI_Новый интент 2');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('tab', { name: /^Промпты/ }).click();
  await page.getByRole('button', { name: 'Промпт', exact: true }).click();
  await expect(page.getByLabel('Название промпта', { exact: true })).toHaveValue('XP_Новый промпт');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('combobox', { name: 'Создать из шаблона', exact: true }).click();
  await page.getByRole('option').first().click();
  await expect(page.getByRole('dialog').getByLabel('Промпт', { exact: true })).toHaveValue('XP_');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Создать', exact: true })).toBeDisabled();
});
