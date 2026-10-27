const DELIMITERS = [';', ',', '\t'];

/** Разделитель угадывается по первой строке (Excel в русской локали сохраняет «;»); по умолчанию «;». */
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  let best = ';';
  let max = 0;
  for (const d of DELIMITERS) {
    const n = first.split(d).length - 1;
    if (n > max) [best, max] = [d, n];
  }
  return best;
}

/** Разбор CSV: кавычки, переводы строк внутри ячеек, BOM; полностью пустые строки пропускаются. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) endCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (cell || row.length) endRow();
  return rows;
}

/** Сборка CSV для Excel: разделитель «;», BOM, CRLF; ячейки с разделителем, кавычками и переводами строк — в кавычках. */
export function toCsv(rows: string[][]): string {
  const q = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n') + '\r\n';
}

/** Строки таблицы в объекты по заголовку (названия колонок без регистра); порядок колонок не важен. */
export function csvObjects(rows: string[][]): Record<string, string>[] {
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}
