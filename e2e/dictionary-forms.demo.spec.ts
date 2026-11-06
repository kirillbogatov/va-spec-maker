import { expect, test } from '@playwright/test';

const saved = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('status', { name: 'Сохранение…', exact: true })).toHaveCount(0);
};

for (const width of [1440, 390]) {
  test(`Перенесённые формы справочников сохраняют поведение VA Spec Maker (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#/p/1/lists/intents');
    await page.getByRole('link', { name: /^INT_ALARM_SET/ }).first().click();
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>;
      (await load('/src/lib/intentMode.ts')).writeIntentMode(1, 'keywords');
    });
    await page.getByRole('combobox', { name: 'Добавить сущность', exact: true }).click();
    await page.getByRole('combobox', { name: 'Поиск', exact: true }).fill('ENT_TEMP_VALUE');
    await page.getByRole('option', { name: /^ENT_TEMP_VALUE/ }).click();
    const entities = page.getByRole('table', { name: 'Сущности в интенте', exact: true });
    await expect(entities.getByRole('columnheader', { name: /Сущность/ })).toBeVisible();
    await expect(entities.getByRole('textbox')).toHaveCount(0);
    const entityTop = (await page.getByRole('heading', { name: 'Сущности в интенте', exact: true }).boundingBox())!.y;
    const keywordTop = (await page.getByRole('heading', { name: /^Ключевые слова/ }).boundingBox())!.y;
    expect(entityTop).toBeLessThan(keywordTop);
    const section = page.getByRole('heading', { name: /^Ключевые слова/ }).locator('../..');
    const addPhrase = section.getByRole('button', { name: 'Добавить', exact: true });
    await expect(section.getByRole('textbox')).toHaveCount(0);
    await addPhrase.click();
    const phrase = section.getByRole('textbox', { name: 'Добавить тренировочную фразу', exact: true });
    await expect(phrase).toBeFocused();
    await phrase.fill('разбуди меня тестовая фраза');
    await phrase.press('Enter');
    await expect(section.locator('li').first()).toContainText('разбуди меня тестовая фраза');
    await expect(section.locator('li').first()).toContainText('ALARM');
    await saved(page);
    await page.reload();
    await expect(section.locator('li').first()).toContainText('разбуди меня тестовая фраза');
    await page.screenshot({ path: info.outputPath(`intent-${width}.png`) });
    const required = entities.getByRole('switch').first();
    const checked = await required.isChecked();
    await required.click();
    await expect(required).toBeChecked({ checked: !checked });
    await saved(page);
    await page.goto('/#/p/1/entities');
    await page.getByRole('link', { name: /^ENT_ROOM/ }).first().click();
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('ENT_ROOM');
    const properties = page.getByRole('heading', { name: 'Свойства', exact: true }).locator('../..');
    await expect(properties.getByRole('combobox', { name: 'Тип сущности', exact: true })).toBeVisible();
    await expect(properties.getByRole('switch', { name: 'Можно назвать несколько значений сразу', exact: true })).toBeVisible();
    const values = page.getByRole('table', { name: 'Значения сущности', exact: true });
    await expect(values).toBeVisible();
    expect((await properties.boundingBox())!.y).toBeLessThan((await values.boundingBox())!.y);
    if (width > 768) {
      const resize = values.getByRole('separator', { name: 'Изменить ширину колонки «Значение»', exact: true });
      const row = values.getByRole('rowgroup').getByRole('row').first();
      const before = await row.evaluate(el => getComputedStyle(el).gridTemplateColumns);
      await resize.focus(); await resize.press('ArrowRight');
      expect(await row.evaluate(el => getComputedStyle(el).gridTemplateColumns)).not.toBe(before);
    }
    await page.screenshot({ path: info.outputPath(`entity-${width}.png`) });
    await page.goto('/#/p/1/lists/keywords');
    await page.getByRole('link', { name: /^ALARM/ }).first().click();
    const synonyms = page.getByRole('heading', { name: 'Синонимы', exact: true }).locator('../..');
    await synonyms.getByRole('button', { name: 'Добавить', exact: true }).click();
    const synonym = synonyms.getByRole('textbox', { name: 'Новый синоним', exact: true });
    await expect(synonym).toBeFocused();
    await synonym.fill('новый синоним QA'); await synonym.press('Enter');
    await synonyms.getByRole('button', { name: 'Редактировать синоним новый синоним QA', exact: true }).click();
    const edit = synonyms.getByRole('textbox', { name: 'Изменить синоним новый синоним QA', exact: true });
    await edit.fill('изменённый синоним QA'); await edit.press('Enter');
    await saved(page); await page.reload();
    await expect(synonyms.locator('li').first()).toContainText('изменённый синоним QA');
    await page.goto('/#/p/1/lists/prompts');
    await page.getByRole('link', { name: /^PRM_ASK_ROOM/ }).first().click();
    const answers = page.getByRole('heading', { name: 'Ответ ассистента', exact: true }).locator('../..');
    await answers.getByRole('button', { name: 'Добавить вариант', exact: true }).click();
    const draft = answers.getByRole('textbox', { name: 'Ответ ассистента: добавить вариант', exact: true });
    await expect(draft).toBeFocused();
    await draft.fill('Новый первый ответ QA'); await draft.press('Enter');
    await expect(answers.getByRole('textbox').first()).toHaveValue('Новый первый ответ QA');
    await saved(page); await page.reload();
    await expect(answers.getByRole('textbox').first()).toHaveValue('Новый первый ответ QA');
    await page.screenshot({ path: info.outputPath(`prompt-${width}.png`) });
    await page.goto('/#/p/1/dependencies');
    await page.getByRole('link', { name: /^DEP_HOME_MODE/ }).first().click();
    const dependencyValues = page.getByRole('heading', { name: 'Возможные значения', exact: true }).locator('../..');
    await dependencyValues.getByRole('button', { name: 'Добавить', exact: true }).click();
    const depDraft = dependencyValues.getByRole('textbox', { name: 'Новое значение', exact: true });
    await depDraft.fill('qa-dependency'); await depDraft.press('Enter');
    await expect(dependencyValues.locator('li').first()).toContainText('qa-dependency');
    await dependencyValues.getByRole('button', { name: 'Редактировать значение qa-dependency', exact: true }).click();
    const depEdit = dependencyValues.getByRole('textbox', { name: 'Значение qa-dependency', exact: true });
    await depEdit.fill('qa-dependency-edited'); await depEdit.press('Enter');
    await saved(page); await page.reload();
    await expect(dependencyValues.locator('li').first()).toContainText('qa-dependency-edited');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
