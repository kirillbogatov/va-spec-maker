import { layoutStateGraph, polylinePath } from './elkLayout';

/**
 * Экспорт схемы сценария в SVG: лист с шапкой, схемой (блоки состояний и карточки переходов на линиях),
 * легендой, таблицами ошибок и глобальных переходов. Раскладка — та же, что в редакторе (ELK, слева направо).
 * Текст переносится по ширине заранее: measure возвращает ширину строки для CSS-шрифта.
 */

export interface SchemePrompt { name: string; text: string }
export interface SchemeState {
  name: string; number: number; tag: 'start' | 'end' | 'unreachable' | null;
  description: string; prompt: SchemePrompt | null; action: string;
}
export interface SchemeEdge {
  id: string; from: string; to: string; number: number;
  intent: string | null; conds: string[]; mode: 'all' | 'any'; example: string;
}
/** Строка таблицы ошибок или глобальных переходов. */
export interface SchemeRule { rule: string; trigger: string[]; prompt: SchemePrompt | null; action: string; targets: string[] }
export interface SchemeInput {
  title: string; subtitle: string; date: string;
  states: SchemeState[]; edges: SchemeEdge[]; errors: SchemeRule[]; globals: SchemeRule[];
  /** @font-face для встраивания в файл (необязательно). */
  fontCss?: string;
}
export type Measure = (text: string, font: string) => number;

const C = {
  fg: '#1b2230', muted: '#566074', faint: '#6b7589', line: '#dfe3ea', brand: '#2b55e0',
  st: '#7a3fd1', stBorder: '#bc9fe8', ent: '#0b7f74', endBorder: '#55a9a1', prm: '#9a5b00', int: '#2b55e0', intBg: '#e8edfd', bad: '#c0302b',
};
const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Consolas, monospace";

interface Style { size: number; weight?: number; mono?: boolean; italic?: boolean; fill: string; upper?: boolean; spacing?: number }
interface Run { text: string; style: Style }
/** Строка текста: x — левый край, y — базовая линия. */
interface Line { x: number; y: number; runs: Run[]; anchor?: 'middle' | 'end' }

const fontOf = (s: Style) => `${s.italic ? 'italic ' : ''}${s.weight ?? 400} ${s.size}px ${s.mono ? MONO : SANS}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function width(m: Measure, text: string, s: Style): number {
  const t = s.upper ? text.toUpperCase() : text;
  return m(t, fontOf(s)) + (s.spacing ?? 0) * t.length;
}

/**
 * Запас ширины при переносе: файл открывают в разных программах, и текст там бывает чуть шире измеренного
 * (другое начертание курсива, иной хинтинг). Текст никогда не обрезается — он переносится и блок растёт.
 */
const SAFETY = 0.94;

/** Перенос по словам; слишком длинное слово режется посимвольно. first — ширина первой строки. */
export function wrap(m: Measure, text: string, s: Style, first: number, rest = first): string[] {
  const out: string[] = [];
  first *= SAFETY;
  rest *= SAFETY;
  let max = first;
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (width(m, cand, s) <= max) { line = cand; continue; }
      if (line) { out.push(line); max = rest; line = ''; }
      let chunk = '';
      for (const ch of word) {
        if (chunk && width(m, chunk + ch, s) > max) { out.push(chunk); max = rest; chunk = ''; }
        chunk += ch;
      }
      line = chunk;
    }
    if (line) { out.push(line); max = rest; }
  }
  return out.length ? out : [''];
}

/** Базовая линия текста размера size в строке высотой lh, начинающейся с top. */
const base = (top: number, lh: number, size: number) => Math.round((top + (lh - size) / 2 + size * 0.8) * 10) / 10;

function textEl(l: Line): string {
  const attrs = (s: Style) =>
    `font-family="${s.mono ? MONO : SANS}" font-size="${s.size}"${s.weight && s.weight !== 400 ? ` font-weight="${s.weight}"` : ''}${s.italic ? ' font-style="italic"' : ''} fill="${s.fill}"${s.spacing ? ` letter-spacing="${s.spacing}"` : ''}`;
  const t = (r: Run) => esc(r.style.upper ? r.text.toUpperCase() : r.text);
  const [first, ...rest] = l.runs;
  return `<text x="${l.x}" y="${l.y}"${l.anchor ? ` text-anchor="${l.anchor}"` : ''} ${attrs(first.style)}>${t(first)}${rest.map((r) => `<tspan ${attrs(r.style)}>${t(r)}</tspan>`).join('')}</text>`;
}

/** Абзацы текста одним стилем начиная с top; возвращает строки и новую верхнюю границу. */
function block(m: Measure, lines: Line[], x: number, top: number, w: number, text: string, s: Style, lh: number): number {
  for (const t of wrap(m, text, s, w)) {
    lines.push({ x, y: base(top, lh, s.size), runs: [{ text: t, style: s }] });
    top += lh;
  }
  return top;
}

const BW = 188;
const CW = 152;
const LABEL: Style = { size: 9, weight: 500, fill: C.faint, upper: true, spacing: 0.45 };

interface Box { width: number; height: number; svg: (x: number, y: number) => string }

function stateBox(m: Measure, s: SchemeState): Box {
  const lines: Line[] = [];
  const L = 14;
  const inner = BW - L - 10;
  let y = 8;
  if (s.tag) {
    const tag = { start: ['Старт', C.brand], end: ['Конец', C.ent], unreachable: ['Недостижимо', C.bad] }[s.tag];
    lines.push({ x: L, y: base(y, 12, 9), runs: [{ text: tag[0], style: { size: 9, weight: 600, fill: tag[1], upper: true, spacing: 0.6 } }] });
    y += 12;
  }
  y = block(m, lines, L, y, inner, s.name, { size: 12, weight: 500, mono: true, fill: C.st }, 16);
  if (s.description.trim()) y = block(m, lines, L, y, inner, s.description.trim(), { size: 11, fill: C.muted }, 15);
  y += 6;
  const rule = y;
  y += 5;
  const section = (label: string, fill: () => void) => {
    y = block(m, lines, L, y, inner, label, LABEL, 12);
    fill();
    y += 3;
  };
  section('Ответ', () => {
    if (!s.prompt) { y = block(m, lines, L, y, inner, '—', { size: 11, fill: C.muted }, 14); return; }
    y = block(m, lines, L, y, inner, s.prompt.name, { size: 10.5, mono: true, fill: C.prm }, 14);
    if (s.prompt.text.trim()) y = block(m, lines, L, y, inner, `«${s.prompt.text.trim()}»`, { size: 10.5, italic: true, fill: C.muted }, 14);
  });
  section('Действие', () => { y = block(m, lines, L, y, inner, s.action.trim() || '—', { size: 11, fill: s.action.trim() ? C.fg : C.muted }, 14); });
  const height = y + 4;
  const border = s.tag === 'start' ? `stroke="${C.brand}" stroke-width="1.6"`
    : s.tag === 'end' ? `stroke="${C.endBorder}" stroke-width="1.3"`
    : s.tag === 'unreachable' ? `stroke="${C.bad}" stroke-width="1.3" stroke-dasharray="4 3"`
    : `stroke="${C.stBorder}" stroke-width="1.3"`;
  return {
    width: BW, height,
    svg: (x, y0) => `<g transform="translate(${x} ${y0})">`
      + `<rect width="${BW}" height="${height}" rx="8" fill="#fff" ${border}/>`
      + `<line x1="0" x2="${BW}" y1="${rule}" y2="${rule}" stroke="${C.line}"/>`
      + `<circle cx="0" cy="0" r="10" fill="${C.st}"/>`
      + textEl({ x: 0, y: 3.6, anchor: 'middle', runs: [{ text: String(s.number), style: { size: 10.5, weight: 600, fill: '#fff' } }] })
      + lines.map(textEl).join('')
      + '</g>',
  };
}

function edgeBox(m: Measure, e: SchemeEdge): Box {
  const lines: Line[] = [];
  const P = 8;
  const inner = CW - 2 * P;
  let y = 6;
  const pillText = `E${e.number}`;
  const pillW = Math.ceil(width(m, pillText, { size: 9.5, weight: 500, mono: true, fill: C.int })) + 12;
  lines.push({ x: P + pillW / 2, y: base(y, 15, 9.5), anchor: 'middle', runs: [{ text: pillText, style: { size: 9.5, weight: 500, mono: true, fill: C.int } }] });
  const total = (e.intent ? 1 : 0) + e.conds.length;
  const head = total > 1 ? `Условия · ${e.mode === 'any' ? 'любое' : 'все'}` : total ? 'Условия' : 'Без условий';
  lines.push({ x: P + pillW + 5, y: base(y, 15, 9), runs: [{ text: head, style: { size: 9, weight: 600, fill: C.faint, upper: true, spacing: 0.45 } }] });
  const pillY = y;
  y += 17;
  const cond: Style = { size: 10, mono: true, fill: C.fg };
  if (e.intent) {
    const pre: Style = { ...cond, fill: C.ent };
    const preW = width(m, 'интент ', pre);
    wrap(m, e.intent, cond, inner - preW, inner).forEach((t, i) => {
      lines.push({ x: P, y: base(y, 14, 10), runs: i ? [{ text: t, style: cond }] : [{ text: 'интент ', style: pre }, { text: t, style: cond }] });
      y += 14;
    });
  }
  for (const c of e.conds) y = block(m, lines, P, y, inner, c, cond, 14);
  if (e.example.trim()) y = block(m, lines, P, y + 2, inner, `«${e.example.trim()}»`, { size: 10.5, italic: true, fill: C.muted }, 14);
  const height = y + 6;
  return {
    width: CW, height,
    svg: (x, y0) => `<g transform="translate(${x} ${y0})">`
      + `<rect width="${CW}" height="${height}" rx="8" fill="#fff" stroke="${C.int}" stroke-width="1.2"/>`
      + `<rect x="${P}" y="${pillY}" width="${pillW}" height="15" rx="7.5" fill="${C.intBg}"/>`
      + lines.map(textEl).join('')
      + '</g>',
  };
}

/** Таблица правил: заголовок раздела, шапка и строки с переносом в ячейках. */
function ruleTable(m: Measure, title: string, rows: SchemeRule[], x: number, top: number, w: number, numbers: Map<string, number>): { svg: string; height: number } {
  const cols = [
    { title: 'Правило', share: 0.17 },
    { title: 'Интент и условия', share: 0.27 },
    { title: 'Ответ ассистента', share: 0.27 },
    { title: 'Действие системы', share: 0.15 },
    { title: 'Куда', share: 0.14 },
  ];
  const xs: number[] = [];
  cols.reduce((acc, c) => { xs.push(acc); return acc + c.share * w; }, x);
  const lines: Line[] = [];
  const rules: number[] = [];
  let y = top;
  lines.push({ x, y: base(y, 14, 10.5), runs: [{ text: title, style: { size: 10.5, weight: 600, fill: C.bad, upper: true, spacing: 0.7 } }] });
  y += 18;
  cols.forEach((c, i) => lines.push({ x: xs[i], y: base(y, 14, 9.5), runs: [{ text: c.title, style: { size: 9.5, weight: 600, fill: C.faint, upper: true, spacing: 0.45 } }] }));
  y += 18;
  rules.push(y);
  const mono: Style = { size: 10.5, mono: true, fill: C.fg };
  const text: Style = { size: 11, fill: C.fg };
  const muted: Style = { size: 11, fill: C.muted };
  rows.forEach((r, ri) => {
    const cells: [string, Style][][] = [
      [[r.rule || '—', { ...text, weight: 500 }]],
      r.trigger.map((t, i) => [t, i === r.trigger.length - 1 && r.trigger.length > 1 ? muted : mono] as [string, Style]),
      r.prompt ? [[r.prompt.name, { ...mono, fill: C.prm }], ...(r.prompt.text.trim() ? [[`«${r.prompt.text.trim()}»`, muted] as [string, Style]] : [])] : [['—', muted]],
      [[r.action.trim() || '—', r.action.trim() ? text : muted]],
      r.targets.length ? r.targets.map((t) => [numbers.has(t) ? `${numbers.get(t)} ${t}` : t, { ...mono, fill: C.st }] as [string, Style]) : [['—', muted]],
    ];
    const top0 = y + 5;
    let bottom = top0;
    cells.forEach((paras, i) => {
      let cy = top0;
      for (const [t, s] of paras) cy = block(m, lines, xs[i], cy, cols[i].share * w - 10, t, s, 15);
      bottom = Math.max(bottom, cy);
    });
    y = bottom + 5;
    if (ri < rows.length - 1) rules.push(y);
  });
  const svg = rules.map((ry) => `<line x1="${x}" x2="${x + w}" y1="${ry}" y2="${ry}" stroke="${C.line}"/>`).join('') + lines.map(textEl).join('');
  return { svg, height: y - top };
}

export async function buildSchemeSvg(input: SchemeInput, m: Measure): Promise<string> {
  const boxes = new Map(input.states.map((s) => [s.name, stateBox(m, s)]));
  const cards = new Map(input.edges.map((e) => [e.id, edgeBox(m, e)]));
  const placed = await layoutStateGraph(
    input.states.map((s) => ({ id: s.name, width: boxes.get(s.name)!.width, height: boxes.get(s.name)!.height })),
    input.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, label: { width: CW, height: cards.get(e.id)!.height } })),
  );

  let dw = 0;
  let dh = 0;
  for (const [name, p] of placed.nodes) { const b = boxes.get(name)!; dw = Math.max(dw, p.x + b.width); dh = Math.max(dh, p.y + b.height); }
  for (const e of placed.edges.values()) {
    if (e.label) { dw = Math.max(dw, e.label.x + e.label.width); dh = Math.max(dh, e.label.y + e.label.height); }
    for (const p of e.segments.flat()) { dw = Math.max(dw, p.x); dh = Math.max(dh, p.y); }
  }
  dw += 20;
  dh += 20;

  const PAD = 28;
  const cw = Math.max(dw, 900);
  const W = Math.round(cw + 2 * PAD);
  const parts: string[] = [];
  const lines: Line[] = [];
  let y = PAD;

  // Шапка: название, вкладка, счётчики
  const stats = `${input.states.length} ${plural(input.states.length, 'состояние', 'состояния', 'состояний')} · ${input.edges.length} ${plural(input.edges.length, 'переход', 'перехода', 'переходов')} · ${input.errors.length} ${plural(input.errors.length, 'ошибка', 'ошибки', 'ошибок')}`;
  const statsW = width(m, stats, { size: 11, fill: C.muted });
  y = block(m, lines, PAD, y, cw - statsW - 24, input.title, { size: 17, weight: 600, fill: C.fg }, 22);
  if (input.subtitle) y = block(m, lines, PAD, y + 2, cw - statsW - 24, input.subtitle, { size: 11, fill: C.muted }, 15);
  lines.push({ x: PAD + cw, y: base(y - 15, 15, 11), runs: [{ text: stats, style: { size: 11, fill: C.muted } }], anchor: 'end' });
  y += 8;
  parts.push(`<line x1="${PAD}" x2="${PAD + cw}" y1="${y}" y2="${y}" stroke="${C.line}"/>`);
  y += 6;

  // Схема
  const dx = Math.round(PAD + (cw - dw) / 2);
  const diagram: string[] = [];
  for (const e of input.edges) {
    const r = placed.edges.get(e.id);
    if (!r) continue;
    const [a, ...rest] = r.segments;
    diagram.push(`<path d="${polylinePath([a])}" fill="none" stroke="${C.faint}" stroke-width="1.4"/>`);
    if (rest.length) diagram.push(`<path d="${polylinePath(rest)}" fill="none" stroke="${C.faint}" stroke-width="1.4" marker-end="url(#ar)"/>`);
    if (a[0]) diagram.push(`<circle cx="${a[0].x}" cy="${a[0].y}" r="3.2" fill="${C.brand}"/>`);
  }
  for (const e of input.edges) {
    const r = placed.edges.get(e.id);
    if (r?.label) diagram.push(cards.get(e.id)!.svg(r.label.x, r.label.y));
  }
  for (const [name, p] of placed.nodes) diagram.push(boxes.get(name)!.svg(p.x, p.y));
  parts.push(`<g transform="translate(${dx} ${y})">${diagram.join('')}</g>`);
  y += dh + 4;

  // Легенда
  const legend: { icon: 'num' | 'card' | null; text: string }[] = [
    { icon: 'num', text: 'номер блока' },
    { icon: 'card', text: 'карточка на линии: номер перехода, условия (интент первой строкой), пример запроса' },
    { icon: null, text: '«все» — все условия выполняются сразу, «любое» — хотя бы одно' },
    { icon: null, text: 'колонки — шаги сценария слева направо' },
  ];
  const ls: Style = { size: 10.5, fill: C.muted };
  let lx = PAD;
  for (const item of legend) {
    const iw = item.icon ? 22 : 0;
    const w = iw + width(m, item.text, ls);
    if (lx > PAD && lx + w > PAD + cw) { lx = PAD; y += 18; }
    if (item.icon === 'num') {
      parts.push(`<circle cx="${lx + 7.5}" cy="${y + 8}" r="7.5" fill="${C.st}"/>`);
      lines.push({ x: lx + 7.5, y: y + 11.2, anchor: 'middle', runs: [{ text: '1', style: { size: 9, weight: 600, fill: '#fff' } }] });
    }
    if (item.icon === 'card') parts.push(`<rect x="${lx}" y="${y + 2}" width="18" height="12" rx="3.5" fill="none" stroke="${C.int}" stroke-width="1.2"/>`);
    lines.push({ x: lx + iw, y: base(y, 16, 10.5), runs: [{ text: item.text, style: ls }] });
    lx += w + 20;
  }
  y += 16 + 14;

  const numbers = new Map(input.states.map((s) => [s.name, s.number]));
  for (const [title, rows] of [['Ошибки сценария', input.errors], ['Глобальные переходы', input.globals]] as const) {
    if (!rows.length) continue;
    const t = ruleTable(m, title, rows, PAD, y, cw, numbers);
    parts.push(t.svg);
    y += t.height + 16;
  }

  parts.push(`<line x1="${PAD}" x2="${PAD + cw}" y1="${y}" y2="${y}" stroke="${C.line}"/>`);
  lines.push({ x: PAD, y: y + 15, runs: [{ text: `VA Spec Maker · экспорт ${input.date}`, style: { size: 10, fill: C.faint } }] });
  const H = Math.round(y + 20 + PAD / 2);

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<title>${esc(input.title)}</title>`
    + `<defs>${input.fontCss ? `<style>${input.fontCss}</style>` : ''}<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C.faint}"/></marker></defs>`
    + `<rect width="${W}" height="${H}" fill="#fff"/>`
    + parts.join('')
    + lines.map(textEl).join('')
    + '</svg>';
}

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}
