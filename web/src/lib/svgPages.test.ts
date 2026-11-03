import { describe, expect, it } from 'vitest';
import { combineSvgPages } from './svgPages';
describe('combineSvgPages', () => {
  const page = (title: string) => `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><defs><marker id="ar"/></defs><path marker-end="url(#ar)"/><text>${title}</text></svg>`;
  it('сохраняет все листы по порядку и разделяет одинаковые id маркеров', () => {
    const svg = combineSvgPages([page('Первая'), page('Вторая')]);
    expect(svg.indexOf('Первая')).toBeLessThan(svg.indexOf('Вторая'));
    expect(svg).toContain('id="sheet-0-ar"');
    expect(svg).toContain('url(#sheet-1-ar)');
    expect(svg).toContain('y="112"');
    expect(svg).toContain('viewBox="0 0 100 192"');
  });
  it('сохраняет единственный лист без изменений', () => {
    expect(combineSvgPages([page('Одна')])).toBe(page('Одна'));
  });
});
