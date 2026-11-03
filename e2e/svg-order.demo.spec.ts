import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';

test('все вкладки в SVG и сохранённая перестановка блоков стрелками', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/p/1/scenarios/1/logic');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const sid = await page.evaluate(async () => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const backend = await load('/src/lib/backend.ts');
    const before = sessionStorage.getItem('va-demo-db');
    const made = await backend.request('POST', '/api/projects/1/scenarios', { name: 'SC_SVG_ORDER' });
    if (made.status !== 201) throw new Error('create scenario');
    const original = (await backend.request('GET', `/api/scenarios/${made.body.id}`)).body;
    const transition = (to: string) => ({ kind: 'transition', state: 'VA_ACTIVATION', next_states: to,
      intent_id: null, request_params: '', condition: '', conditions: [], prompt_id: null, system_action: '' });
    const result = await backend.request('PUT', `/api/scenarios/${made.body.id}`, { ...original, parts: [
      { name: 'Первая', description: '', steps: ['ST_A', 'ST_B', 'ST_C'].map(transition),
        layout: Object.fromEntries(['VA_ACTIVATION', 'ST_A', 'ST_B', 'ST_C'].map((n) => [n, { x: 0, y: 0 }])) },
      { name: 'Вторая', description: '', steps: [transition('ST_SECOND_ONLY')], layout: { ST_SECOND_ONLY: { x: 0, y: 0, description: 'Только вторая вкладка' } } },
      { name: 'Пустая', description: '', steps: [], layout: {} },
    ] });
    if (result.status !== 200) throw new Error('save scenario');
    const started = Date.now();
    while (sessionStorage.getItem('va-demo-db') === before && Date.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return made.body.id as number;
  });
  await page.goto(`/?fixture=${sid}#/p/1/scenarios/${sid}/logic`);
  const canvas = page.getByRole('region', { name: 'Редактор схемы' });
  const node = (name: string) => page.locator('.react-flow__node').filter({ has: page.getByText(name, { exact: true }) });
  const y = async (name: string) => (await node(name).boundingBox())!.y;
  await expect(node('ST_C')).toBeVisible();
  const siblings = await Promise.all(['ST_A', 'ST_B', 'ST_C'].map(async (name) => ({ name, y: await y(name) })));
  siblings.sort((a, b) => a.y - b.y);
  const top = siblings[0].name;
  const selected = siblings[1].name;
  await node(selected).click();
  await canvas.press('ArrowUp');
  await expect.poll(async () => await y(selected) < await y(top)).toBe(true);
  await canvas.press('ArrowDown');
  await expect.poll(async () => await y(top) < await y(selected)).toBe(true);
  const before = await page.evaluate(() => sessionStorage.getItem('va-demo-db'));
  await canvas.press('ArrowUp');
  // Нажимаем экспорт сразу, пока изменение ещё ожидает автосохранения.
  const docxDownloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт .docx', exact: true }).click();
  const docx = await readFile((await (await docxDownloading).path())!);
  const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml')!.async('string');
  expect(xml.indexOf(selected)).toBeGreaterThanOrEqual(0);
  expect(xml.indexOf(selected)).toBeLessThan(xml.indexOf(top));
  await expect.poll(async () => await y(selected) < await y(top)).toBe(true);
  await page.getByLabel('Описание состояния').press('ArrowDown');
  await expect.poll(async () => await y(selected) < await y(top)).toBe(true);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('va-demo-db'))).not.toBe(before);
  await page.screenshot({ path: testInfo.outputPath('ordered-scheme.png') });
  await page.reload();
  await expect(node(selected)).toBeVisible();
  await expect.poll(async () => await y(selected) < await y(top)).toBe(true);
  await page.getByRole('tab', { name: /^Предпросмотр/ }).click();
  await expect(page.locator('article')).toContainText(selected);
  const previewText = await page.locator('article').innerText();
  expect(previewText.indexOf(selected)).toBeLessThan(previewText.indexOf(top));
  await page.getByRole('tab', { name: /^Логика/ }).click();
  // Активна первая вкладка; в файле должны оказаться также вторая и пустая.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const svg = await readFile((await (await downloading).path())!, 'utf8');
  expect(svg).toContain('Первая');
  expect(svg).toContain('Вторая');
  expect(svg).toContain('Пустая');
  expect(svg).toContain('ST_SECOND_ONLY');
  const parsed = await page.evaluate((text) => {
    const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
    const ids = [...xml.querySelectorAll('[id]')].map((n) => n.id);
    return { errors: xml.querySelectorAll('parsererror').length, sheets: xml.querySelectorAll('[data-sheet]').length, ids, viewBox: xml.documentElement.getAttribute('viewBox') };
  }, svg);
  expect(parsed.errors).toBe(0);
  expect(parsed.sheets).toBe(3);
  expect(new Set(parsed.ids).size).toBe(parsed.ids.length);
  expect(parsed.viewBox).not.toMatch(/NaN|Infinity/);
  const preview = await context.newPage();
  await preview.setViewportSize({ width: 1100, height: 900 });
  await preview.setContent(`<style>body{margin:0}img{width:100%;display:block}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
  await expect(preview.locator('img')).toHaveJSProperty('complete', true);
  await preview.screenshot({ path: testInfo.outputPath('svg-all-tabs.png'), fullPage: true });
  await preview.close();
});
