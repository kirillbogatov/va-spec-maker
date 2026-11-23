import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function openScenarioWithSecondBranch(page: Page, testInfo: TestInfo, makeComparisonDiff = false): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/#/');
  const projectLink = page.getByRole('main').getByRole('link').first();
  await expect(projectLink).toBeVisible();
  await projectLink.click();
  await expect(page).toHaveURL(/#\/p\/\d+\/scenarios/);
  const mainBranchId = Number(page.url().match(/#\/p\/(\d+)/)?.[1]);
  const scenarioName = await page.getByRole('textbox', { name: 'Название сценария' }).inputValue();
  await page.screenshot({ path: testInfo.outputPath('scenario-before.png'), fullPage: true });

  await page.getByRole('button', { name: 'Действия с ветками' }).click();
  await page.getByRole('menuitem', { name: 'Клонировать', exact: true }).click();
  const cloneDialog = page.getByRole('dialog');
  await cloneDialog.getByLabel('Название ветки').fill('e2e-branch-actions');
  await cloneDialog.getByRole('button', { name: 'Клонировать' }).click();
  await expect(page).toHaveURL(/#\/p\/\d+\/scenarios/);

  if (makeComparisonDiff) {
    const cloneBranchId = Number(page.url().match(/#\/p\/(\d+)/)?.[1]);
    await page.goto(`/#/p/${cloneBranchId}/scenarios`);
    await page.getByRole('link', { name: scenarioName }).click();
    const description = page.getByRole('textbox', { name: 'Описание сценария' });
    await description.fill(`${await description.inputValue()}\nИзменение для проверки цветового сравнения`);
    await page.getByRole('tab', { name: 'Предпросмотр' }).click();
    await expect(page.getByRole('article').getByText(/Изменение для проверки цветового сравнения/)).toBeVisible();
    await page.goto(`/#/p/${mainBranchId}/scenarios`);
    await page.getByRole('link', { name: scenarioName }).click();
  } else {
    await page.getByRole('button', { name: /^Сменить ветку:/ }).click();
    await page.getByRole('menuitem', { name: 'main', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Действия со сценарием' })).toBeVisible();
}

test('копирование сценария остаётся доступным после закрытия меню', async ({ page }, testInfo) => {
  await openScenarioWithSecondBranch(page, testInfo);
  await page.getByRole('button', { name: 'Действия со сценарием' }).click();
  await page.screenshot({ path: testInfo.outputPath('scenario-menu.png'), fullPage: true });

  await page.getByRole('menuitem', { name: 'Скопировать в ветку' }).click();
  const copyDialog = page.getByRole('dialog', { name: 'Скопировать сценарий в ветку' });
  await expect(copyDialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('copy-dialog.png'), fullPage: true });
  await copyDialog.getByRole('button', { name: 'Продолжить' }).click({ timeout: 2_000 });

  const confirmDialog = page.getByRole('alertdialog');
  await expect(confirmDialog.getByRole('heading', { name: /Перезаписать сценарий/ })).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Перезаписать' }).click();
  await expect(page.getByText(/перезаписан в ветке/)).toBeVisible();
});

test('сравнение версий остаётся интерактивным после закрытия меню', async ({ page }, testInfo) => {
  await openScenarioWithSecondBranch(page, testInfo, true);
  await page.getByRole('button', { name: 'Действия со сценарием' }).click();
  await page.screenshot({ path: testInfo.outputPath('scenario-menu.png'), fullPage: true });

  await page.getByRole('menuitem', { name: 'Сравнить версии' }).click();
  const compareDialog = page.getByRole('dialog', { name: 'Сравнение спецификаций' });
  await expect(compareDialog).toBeVisible();
  const branchSelect = compareDialog.getByRole('combobox').nth(0);
  await branchSelect.click({ timeout: 2_000 });
  const branchOption = page.getByRole('option', { name: 'e2e-branch-actions' });
  await expect(branchOption).toBeVisible();
  const branchTriggerBox = await branchSelect.boundingBox();
  const branchOptionBox = await branchOption.boundingBox();
  expect(branchTriggerBox && branchOptionBox && branchOptionBox.y >= branchTriggerBox.y + branchTriggerBox.height).toBeTruthy();
  await branchOption.click();
  await expect(branchOption).toBeHidden();
  await expect(branchSelect).toContainText('e2e-branch-actions');
  const scenarioSelect = compareDialog.getByRole('combobox').nth(1);
  await scenarioSelect.click();
  const scenarioOption = page.getByRole('option').first();
  await expect(scenarioOption).toBeVisible();
  const scenarioTriggerBox = await scenarioSelect.boundingBox();
  const scenarioOptionBox = await scenarioOption.boundingBox();
  expect(scenarioTriggerBox && scenarioOptionBox && scenarioOptionBox.y >= scenarioTriggerBox.y + scenarioTriggerBox.height).toBeTruthy();
  const scenarioName = (await scenarioOption.innerText()).trim();
  await scenarioOption.click();
  await expect(scenarioSelect).toContainText(scenarioName);
  await expect(compareDialog.getByText('Текущая ветка: main')).toBeVisible();
  const dialogBox = await compareDialog.boundingBox();
  expect(dialogBox?.width).toBeGreaterThan(1_500);
  const selectors = compareDialog.getByRole('combobox');
  const branchSelectBox = await selectors.nth(0).boundingBox();
  const scenarioSelectBox = await selectors.nth(1).boundingBox();
  expect(branchSelectBox && scenarioSelectBox && Math.abs(branchSelectBox.y - scenarioSelectBox.y) < 1).toBeTruthy();
  expect(branchSelectBox && scenarioSelectBox && branchSelectBox.width <= 320 && scenarioSelectBox.width <= 320).toBeTruthy();
  expect(branchSelectBox && scenarioSelectBox && scenarioSelectBox.x < branchSelectBox.x + branchSelectBox.width + 32).toBeTruthy();
  const compareScroller = compareDialog.locator('.overflow-auto.rounded-lg.border');
  const stickyHeader = compareScroller.locator('div.sticky');
  await expect(stickyHeader).toHaveCount(1);
  const headerColumns = stickyHeader.locator(':scope > div');
  await expect(headerColumns).toHaveCount(2);
  const leftBox = await headerColumns.nth(0).boundingBox();
  const rightBox = await headerColumns.nth(1).boundingBox();
  expect(leftBox && rightBox && leftBox.x < rightBox.x).toBeTruthy();
  await compareScroller.evaluate((element) => { element.scrollTop = 320; });
  const scrollerBox = await compareScroller.boundingBox();
  const stickyHeaderBox = await stickyHeader.boundingBox();
  expect(scrollerBox && stickyHeaderBox && Math.abs(stickyHeaderBox.y - scrollerBox.y) < 2).toBeTruthy();
  await compareScroller.evaluate((element) => { element.scrollTop = 0; });
  const currentSpec = compareDialog.locator('[data-spec-pane="current"]');
  const comparisonSpec = compareDialog.locator('[data-spec-pane="comparison"]');
  const currentTitle = currentSpec.getByRole('heading', { name: scenarioName }).first();
  const comparisonTitle = comparisonSpec.getByRole('heading', { name: scenarioName }).first();
  await expect(currentTitle).toBeVisible();
  await expect(comparisonTitle).toBeVisible();
  const currentTitleBox = await currentTitle.boundingBox();
  const comparisonTitleBox = await comparisonTitle.boundingBox();
  expect(currentTitleBox && comparisonTitleBox && Math.abs(currentTitleBox.y - comparisonTitleBox.y) < 1).toBeTruthy();
  await expect(currentSpec).not.toHaveCount(0);
  await expect(comparisonSpec).toHaveCount(await currentSpec.count());
  await expect(currentSpec.getByRole('heading', { name: 'Режимы работы' })).toHaveCount(0);
  await expect(comparisonSpec.getByRole('heading', { name: 'Режимы работы' })).toHaveCount(0);
  await expect(currentSpec.locator('[data-diff-kind="removed"]')).not.toHaveCount(0);
  await expect(comparisonSpec.locator('[data-diff-kind="added"]')).not.toHaveCount(0);
  await expect(compareDialog.getByText('Различий между спецификациями нет')).toHaveCount(0);
  await expect(currentSpec.getByText('Изменение для проверки цветового сравнения')).toHaveCount(0);
  const addedDescription = comparisonSpec.getByText('Изменение для проверки цветового сравнения');
  await expect(addedDescription).toBeVisible();
  expect(await addedDescription.evaluate((element) => element.closest('[data-diff-kind="added"]'))).not.toBeNull();
  await page.screenshot({ path: testInfo.outputPath('compare-dialog.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(compareDialog).toBeVisible();
  await expect(compareDialog.locator('pre')).toHaveCount(0);
});

test('после копирования результат сравнения отражает оставшиеся различия', async ({ page }, testInfo) => {
  await openScenarioWithSecondBranch(page, testInfo);
  await page.getByRole('button', { name: 'Действия со сценарием' }).click();
  await page.getByRole('menuitem', { name: 'Скопировать в ветку' }).click();
  const copyDialog = page.getByRole('dialog', { name: 'Скопировать сценарий в ветку' });
  await expect(copyDialog).toBeVisible();
  await copyDialog.getByRole('button', { name: 'Продолжить' }).click();
  const confirmDialog = page.getByRole('alertdialog');
  await expect(confirmDialog.getByRole('heading', { name: /Перезаписать сценарий/ })).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Перезаписать' }).click();
  await expect(page.getByText(/перезаписан в ветке/)).toBeVisible();

  await page.getByRole('button', { name: 'Действия со сценарием' }).click();
  await page.getByRole('menuitem', { name: 'Сравнить версии' }).click();
  const compareDialog = page.getByRole('dialog', { name: 'Сравнение спецификаций' });
  await expect(compareDialog).toBeVisible();
  const sections = compareDialog.locator('[data-spec-pane]');
  const noDifferences = compareDialog.getByRole('status').getByText('Различий между спецификациями нет');
  await expect.poll(async () => Math.max(await sections.count(), await noDifferences.count())).toBeGreaterThan(0);
  if (await sections.count()) await expect(noDifferences).toHaveCount(0);
  else await expect(noDifferences).toBeVisible();
});
