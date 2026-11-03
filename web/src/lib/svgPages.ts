/** Объединяет листы в один SVG, сохраняя масштаб и изолируя маркеры каждого листа. */
export function combineSvgPages(pages: string[]): string {
  if (pages.length === 1) return pages[0];
  let height = 0;
  let width = 0;
  const sheets = pages.map((page, i) => {
    const svg = page.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/);
    const box = svg?.[1].match(/viewBox="([^"]+)"/)?.[1].split(/[\s,]+/).map(Number);
    if (!svg || !box || box.length !== 4 || box.some((n) => !Number.isFinite(n)) || box[2] <= 0 || box[3] <= 0) throw new Error('Некорректный лист SVG');
    const [, , w, h] = box;
    const content = svg[2]
      .replace(/\bid="([^"]+)"/g, (_, id: string) => `id="sheet-${i}-${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#sheet-${i}-${id})`)
      .replace(/\bhref="#([^"]+)"/g, (_, id: string) => `href="#sheet-${i}-${id}"`);
    const sheet = `<svg x="0" y="${height}" width="${w}" height="${h}" viewBox="${box.join(' ')}" data-sheet="${i + 1}">${content}</svg>`;
    width = Math.max(width, w);
    height += h + 32;
    return sheet;
  });
  height = Math.max(1, height - 32);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width || 1}" height="${height}" viewBox="0 0 ${width || 1} ${height}"><rect width="100%" height="100%" fill="#fff"/>${sheets.join('')}</svg>`;
}
