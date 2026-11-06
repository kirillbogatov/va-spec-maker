import { expect, test } from '@playwright/test';

for (const [mode, width] of [['keywords', 1440], ['keywords', 390], ['phrases', 1440], ['patterns', 1440], ['both', 1440]] as const) {
  test(`Строки интента редактируются на месте: ${mode}, ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#/p/1/lists/intents');
    await expect(page.getByRole('button', { name: 'Новый интент', exact: true })).toBeVisible();
    await page.evaluate(async (mode) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>;
      (await load('/src/lib/intentMode.ts')).writeIntentMode(1, mode);
    }, mode);
    await page.getByRole('button', { name: 'Новый интент', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill('INT_EDIT_QA');
    await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('INT_EDIT_QA');
    const heading = mode === 'keywords' ? /^Ключевые слова/ : mode === 'both' ? /^Значения$/ : mode === 'patterns' ? /^Паттерны$/ : /^Тренировочные фразы$/;
    const section = page.getByRole('heading', { name: heading }).locator('../..');
    const noun = mode === 'patterns' ? 'паттерн' : 'фразу';
    const editLabel = mode === 'patterns' ? 'Изменить паттерн' : 'Изменить фразу';
    for (const text of ['включи свет', 'выключи свет']) {
      await section.getByRole('button', { name: 'Добавить', exact: true }).click();
      const field = section.getByRole('textbox', { name: mode === 'patterns' ? 'Добавить паттерн' : 'Добавить тренировочную фразу', exact: true });
      await field.fill(text); await field.press('Enter');
    }
    const initial = 'выключи свет';
    const display = section.getByRole('button', { name: `Редактировать ${noun} ${initial}`, exact: true });
    const input = section.getByRole('textbox', { name: editLabel, exact: true });
    await display.click();
    await expect(input).toBeFocused();
    await input.fill('отмена правки'); await input.press('Escape');
    await expect(display).toBeVisible();
    await display.focus(); await display.press('Enter');
    await input.fill(''); await input.press('Enter');
    await expect(section.getByRole('alert')).toHaveText('Введите текст');
    await input.fill('разбуди меня');
    if (mode === 'keywords') {
      await expect(section.locator('li').first()).toContainText('ALARM');
      await expect(section.locator('li').first()).not.toContainText('OFF');
    }
    await page.screenshot({ path: info.outputPath('editing.png') });
    await input.press('Enter');
    await expect(section.getByRole('button', { name: `Редактировать ${noun} разбуди меня`, exact: true })).toBeVisible();
    await section.getByRole('button', { name: `Редактировать ${noun} включи свет`, exact: true }).click();
    await input.fill('выключи звук');
    await page.getByRole('heading', { name: 'Сущности в интенте', exact: true }).click();
    await expect(section.getByRole('button', { name: `Редактировать ${noun} выключи звук`, exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Сохранение…', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(section.getByRole('button', { name: `Редактировать ${noun} разбуди меня`, exact: true })).toBeVisible();
    await expect(section.getByRole('button', { name: `Редактировать ${noun} выключи звук`, exact: true })).toBeVisible();
    await expect(section.locator('li')).toHaveCount(2);
  });
}
