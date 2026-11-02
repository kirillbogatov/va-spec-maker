/**
 * Разбор спецификации L3 в общую модель: HTML-выгрузка документа из Devprom или Markdown (зеркало HMX-DB).
 * Документ делится на разделы-спецификации, раздел — на заголовки, текст и таблицы (ячейка — текст со строками).
 */

export type L3Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'table'; rows: string[][] };

export interface L3Section { title: string; blocks: L3Block[] }
export interface L3Document { title: string; sections: L3Section[] }

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', times: '×', deg: '°', shy: '',
};

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Строки без лишних пробелов, пустые убраны. */
const tidy = (s: string) =>
  s
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t​]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

// ---------- HTML (Devprom) ----------

/** HTML-фрагмент → текст: абзацы и переносы — новые строки, пункты списков — «- ». */
function htmlText(html: string): string {
  const s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|ul|ol|h\d|tr|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '');
  // В выгрузках Devprom встречается двойное экранирование
  return tidy(decode(decode(s)));
}

const TABLE_TAG = /<(\/?)table\b[^>]*>/gi;

/** Конец таблицы, начинающейся в start, с учётом вложенных таблиц. */
function tableEnd(s: string, start: number): number {
  TABLE_TAG.lastIndex = start;
  let depth = 0;
  for (let m = TABLE_TAG.exec(s); m; m = TABLE_TAG.exec(s)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return TABLE_TAG.lastIndex;
  }
  return s.length;
}

/** Строки таблицы; вложенные таблицы становятся текстом своей ячейки; rowspan/colspan раскрываются копированием. */
function tableRows(table: string): string[][] {
  let inner = table.slice(table.indexOf('>') + 1, table.lastIndexOf('<'));
  // вложенные таблицы → текст (иначе их <tr> перепутаются со строками внешней)
  for (let i = inner.search(/<table\b/i); i !== -1; i = inner.search(/<table\b/i)) {
    const end = tableEnd(inner, i);
    inner = inner.slice(0, i) + htmlText(inner.slice(i, end)) + inner.slice(end);
  }
  const grid: string[][] = [];
  const carry: { text: string; left: number }[] = [];
  const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  rows.forEach((row, r) => {
    const out: string[] = (grid[r] = []);
    let col = 0;
    const fill = () => {
      while (carry[col]?.left > 0) {
        out[col] = carry[col].text;
        carry[col].left--;
        col++;
      }
    };
    for (const cell of row[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      fill();
      const text = htmlText(cell[3]);
      const rs = Number(/rowspan=["']?(\d+)/i.exec(cell[2])?.[1] ?? 1);
      const cs = Number(/colspan=["']?(\d+)/i.exec(cell[2])?.[1] ?? 1);
      for (let k = 0; k < cs; k++) {
        out[col] = text;
        if (rs > 1) carry[col] = { text, left: rs - 1 };
        col++;
      }
    }
    fill();
    for (let k = 0; k < out.length; k++) out[k] ??= '';
  });
  return grid.filter((r) => r.some((c) => c.trim()));
}

const HEADING_OR_TABLE = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\d>|<table\b/gi;

function parseHtml(src: string, fallback: string): L3Document {
  const s = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*>/gi, '');
  const sections: (L3Section & { page?: boolean })[] = [];
  let title = '';
  let cur: L3Section & { page?: boolean } = { title: fallback, blocks: [] };
  sections.push(cur);
  const text = (html: string) => {
    const t = htmlText(html);
    if (t) cur.blocks.push({ kind: 'text', text: t });
  };
  let pos = 0;
  HEADING_OR_TABLE.lastIndex = 0;
  for (let m = HEADING_OR_TABLE.exec(s); m; m = HEADING_OR_TABLE.exec(s)) {
    text(s.slice(pos, m.index));
    if (m[1]) {
      // Devprom закрывает любой заголовок тегом </h1>, поэтому уровень берём только из открывающего тега.
      const head = htmlText(m[3]).replace(/\n/g, ' ');
      if (m[1] === '1' || /\bid=["']\d+["']/.test(m[2])) {
        title ||= head;
        cur = { title: head, blocks: [], page: true };
        sections.push(cur);
      } else cur.blocks.push({ kind: 'heading', level: Number(m[1]), text: head });
      pos = HEADING_OR_TABLE.lastIndex;
    } else {
      const end = tableEnd(s, m.index);
      cur.blocks.push({ kind: 'table', rows: tableRows(s.slice(m.index, end)) });
      pos = end;
      HEADING_OR_TABLE.lastIndex = end;
    }
  }
  text(s.slice(pos));
  // Если в выгрузке нет страниц Devprom (заголовков с id) — весь файл считается одной спецификацией.
  const pages = sections.filter((x) => x.page);
  return { title: title || fallback, sections: pages.length ? pages : sections };
}

// ---------- Markdown (HMX-DB) ----------

const mdInline = (s: string) =>
  tidy(
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, t: string, u: string) => (t.trim() ? t : u))
      .replace(/\*\*|__/g, '')
      .replace(/\\\|/g, '|')
      .replace(/<[^>]+>/g, ''),
  );

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map(mdInline);

function parseMd(src: string, fallback: string): L3Document {
  let body = src.replace(/\r\n?/g, '\n');
  let docTitle = '';
  let fmTitle = '';
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(body);
  if (fm) {
    fmTitle = /^title:\s*"?(.*?)"?\s*$/m.exec(fm[1])?.[1] ?? '';
    docTitle = /^document:\s*"?(.*?)"?\s*$/m.exec(fm[1])?.[1] ?? '';
    body = body.slice(fm[0].length);
  }
  const sections: L3Section[] = [];
  let cur: L3Section | null = null;
  const section = () => (cur ??= (sections.push({ title: fmTitle || fallback, blocks: [] }), sections[sections.length - 1]));
  const lines = body.split('\n');
  let para: string[] = [];
  const flush = () => {
    const t = mdInline(para.join('\n'));
    if (t) section().blocks.push({ kind: 'text', text: t });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      while (++i < lines.length && !/^```/.test(lines[i]));
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const text = mdInline(h[2]);
      if (h[1].length === 1) {
        cur = { title: text || fmTitle || fallback, blocks: [] };
        sections.push(cur);
      } else section().blocks.push({ kind: 'heading', level: h[1].length, text });
      continue;
    }
    if (line.trim().startsWith('|')) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
        if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i]) || !lines[i].includes('-')) rows.push(splitRow(lines[i]));
      }
      i--;
      section().blocks.push({ kind: 'table', rows: rows.filter((r) => r.some((c) => c)) });
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return { title: docTitle || fmTitle || fallback, sections };
}

/** Формат определяется по содержимому: HTML-выгрузка Devprom или Markdown. */
export function parseL3(text: string, fileName = ''): L3Document {
  const fallback = fileName.replace(/\.[^.]+$/, '') || 'L3';
  return /<(table|h[1-6]|html|body)\b/i.test(text) ? parseHtml(text, fallback) : parseMd(text, fallback);
}
