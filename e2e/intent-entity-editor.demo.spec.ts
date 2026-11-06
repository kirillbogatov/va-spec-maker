import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`Сущность на странице интента создаётся и редактируется со значениями (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#/p/1/lists/intents');
    await page.getByRole('link', { name: /^INT_ALARM_SET/ }).first().click();
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('INT_ALARM_SET');
    const picker = page.getByRole('combobox', { name: 'Добавить сущность', exact: true });
    await picker.click();
    const list = page.getByRole('listbox');
    await expect(list.getByRole('option').first()).toContainText('Новая сущность');
    await expect(list.locator('[data-slot="create-option-separator"]')).toBeVisible();
    await page.screenshot({ path: info.outputPath('create-first.png') });
    await page.getByRole('combobox', { name: 'Поиск', exact: true }).fill('нет такого элемента');
    await expect(list.getByRole('option')).toHaveCount(1);
    await list.getByRole('option').first().click();
    const dialog = page.getByRole('dialog', { name: 'Добавить сущность', exact: true });
    await dialog.getByRole('textbox', { name: 'Название сущности', exact: true }).fill('ENT_DIALOG_QA');
    await dialog.getByRole('textbox', { name: 'Описание сущности', exact: true }).fill('Создано из интента');
    await dialog.getByRole('switch', { name: 'Можно назвать несколько значений сразу', exact: true }).click();
    await dialog.getByRole('button', { name: 'Значение', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Новое значение сущности', exact: true }).fill('desk');
    const synonyms = dialog.getByRole('textbox', { name: 'Новый синоним для desk', exact: true });
    await synonyms.fill('рабочий стол'); await synonyms.press('Enter');
    await page.screenshot({ path: info.outputPath('entity-draft.png') });
    // Сохранение прямо из активной строки должно включать её значение.
    await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(dialog).toBeHidden();
    const table = page.getByRole('table', { name: 'Сущности в интенте', exact: true });
    const row = table.getByRole('row').filter({ hasText: 'ENT_DIALOG_QA' });
    await expect(row).toContainText('desk');
    await expect(row.getByRole('textbox')).toHaveCount(0);
    const open = row.getByRole('button', { name: 'Редактировать сущность ENT_DIALOG_QA', exact: true });
    await open.click();
    const edit = page.getByRole('dialog', { name: 'Сущность ENT_DIALOG_QA', exact: true });
    await expect(edit.getByRole('textbox', { name: 'Значение 1', exact: true })).toHaveValue('desk');
    await expect(edit.getByRole('button', { name: 'Редактировать синоним рабочий стол', exact: true })).toBeVisible();
    await expect(edit.getByRole('switch', { name: 'Можно назвать несколько значений сразу', exact: true })).toBeChecked();
    await edit.getByRole('textbox', { name: 'Значение 1', exact: true }).fill('discarded');
    await edit.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(edit).toBeHidden();
    await expect(row).toContainText('desk');
    await open.click();
    await edit.getByRole('textbox', { name: 'Значение 1', exact: true }).fill('table');
    await edit.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(edit).toBeHidden();
    await expect(row).toContainText('table');
    await expect(page.getByRole('status', { name: 'Сохранение…', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(row).toContainText('table');
    await open.click();
    await expect(edit.getByRole('textbox', { name: 'Описание сущности', exact: true })).toHaveValue('Создано из интента');
    await expect(edit.getByRole('textbox', { name: 'Значение 1', exact: true })).toHaveValue('table');
    await page.screenshot({ path: info.outputPath('entity-saved.png') });
  });
}


test('Полный редактор сущностей доступен также внутри интента сценария', async ({ page }) => {
  await page.goto('/#/p/1/scenarios/1/intents');
  await page.getByText('INT_LIGHT_ON', { exact: true }).click();
  const intent = page.getByRole('dialog', { name: /^Интент INT_LIGHT_ON/ });
  await expect(intent).toBeVisible();
  await intent.getByRole('combobox', { name: 'Добавить сущность', exact: true }).click();
  const list = page.getByRole('listbox');
  await expect(list.getByRole('option').first()).toContainText('Новая сущность');
  await expect(list.locator('[data-slot="create-option-separator"]')).toBeVisible();
  await list.getByRole('option').first().click();
  const entity = page.getByRole('dialog', { name: 'Добавить сущность', exact: true });
  await entity.getByRole('textbox', { name: 'Название сущности', exact: true }).fill('ENT_SCENARIO_EDITOR_QA');
  await entity.getByRole('combobox', { name: 'Тип сущности', exact: true }).click();
  await page.getByRole('option', { name: 'Число', exact: true }).click();
  await entity.getByRole('spinbutton', { name: 'Начало диапазона', exact: true }).fill('16');
  await entity.getByRole('spinbutton', { name: 'Конец диапазона', exact: true }).fill('30');
  await entity.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(entity).toBeHidden();
  await expect(intent.getByRole('button', { name: 'Редактировать сущность ENT_SCENARIO_EDITOR_QA', exact: true })).toBeVisible();
  await intent.getByRole('button', { name: 'Редактировать сущность ENT_SCENARIO_EDITOR_QA', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Сущность ENT_SCENARIO_EDITOR_QA', exact: true });
  await expect(edit.getByRole('spinbutton', { name: 'Начало диапазона', exact: true })).toHaveValue('16');
  await expect(edit.getByRole('spinbutton', { name: 'Конец диапазона', exact: true })).toHaveValue('30');
});
