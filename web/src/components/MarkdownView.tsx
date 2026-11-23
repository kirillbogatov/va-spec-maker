import { createElement, Fragment, type ReactNode } from 'react';
import { parseTextLinks } from '@va/core';

/** Минимальный рендер того Markdown, который выдаёт экспорт: заголовки, списки, таблицы, **жирный**, _курсив_, <br>. */
function formattedText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|(?<!\w)_[^_]+_(?!\w)|<br>)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index).replace(/\\\|/g, '|'));
    const t = m[0];
    if (t === '<br>') out.push(<br key={k++} />);
    else if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last).replace(/\\\|/g, '|'));
  return out;
}

function inline(text: string): ReactNode[] {
  return parseTextLinks(text.replace(/\\\|/g, '|')).map((part, i) => part.url
    ? <a key={i} href={part.url} target="_blank" rel="noopener noreferrer" className="text-primary no-underline hover:font-semibold">{formattedText(part.text)}</a>
    : <Fragment key={i}>{formattedText(part.text)}</Fragment>);
}

export function MarkdownInline({ text }: { text: string }) {
  return <>{inline(text)}</>;
}

const splitRow = (line: string) =>
  line.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());

export interface Heading { id: string; text: string; level: number; count: number }
export type MarkdownLineDiff = 'added' | 'removed' | undefined;

const lineDiffClass = (kind: MarkdownLineDiff) => kind === 'removed'
  ? 'bg-red-100 text-red-950 dark:bg-red-950/40 dark:text-red-100'
  : kind === 'added'
    ? 'bg-green-100 text-green-950 dark:bg-green-950/40 dark:text-green-100'
    : '';

const lineDiffProps = (kind: MarkdownLineDiff) => kind
  ? { 'data-diff-kind': kind, className: `rounded-sm px-1 [-webkit-box-decoration-break:clone] [box-decoration-break:clone] ${lineDiffClass(kind)}` }
  : {};

const headingPattern = /^(#{1,6}) (.*)$/;
const orderedItem = /^(\d+)[.)] +(.*)$/;
const headingClass = [
  'text-2xl font-semibold tracking-tight',
  'mt-5 scroll-mt-4 border-b pb-1 text-lg font-semibold',
  'mt-3 scroll-mt-4 text-base font-semibold',
  'mt-3 scroll-mt-4 text-sm font-semibold',
  'mt-2 scroll-mt-4 text-sm font-medium',
  'mt-2 scroll-mt-4 text-sm font-medium',
];

const headingId = (i: number) => `md-h-${i}`;
const plain = (t: string) => t.replace(/\*\*|<br>/g, '').replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');

/** Заголовки документа для оглавления; count — число строк таблицы или пунктов списка в разделе. */
export function extractHeadings(source: string): Heading[] {
  const lines = source.split('\n');
  const out: Heading[] = [];
  lines.forEach((line, i) => {
    const m = headingPattern.exec(line);
    if (m) out.push({ id: headingId(i), text: plain(m[2]), level: m[1].length, count: 0 });
    else if (out.length) {
      const h = out[out.length - 1];
      if (line.startsWith('- ') || orderedItem.test(line)) h.count++;
      else if (line.startsWith('|') && !/^\|[-| ]+\|$/.test(line)) h.count++;
    }
  });
  // первая строка каждой таблицы — шапка
  let k = -1;
  lines.forEach((line, i) => {
    if (headingPattern.test(line)) k++;
    if (line.startsWith('|') && !lines[i - 1]?.startsWith('|') && k >= 0 && out[k]) out[k].count = Math.max(0, out[k].count - 1);
  });
  return out;
}

export function MarkdownView({ source, lineDiff, headingIdPrefix = 'md-h', lineOffset = 0 }: {
  source: string;
  lineDiff?: MarkdownLineDiff[];
  headingIdPrefix?: string;
  lineOffset?: number;
}) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const heading = headingPattern.exec(line);
    if (line.startsWith('|')) {
      const rows: { cells: string[]; lineIndex: number }[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push({ cells: splitRow(lines[i]), lineIndex: i });
        i++;
      }
      i--;
      const [headRow, ...body] = rows;
      const head = headRow.cells;
      // Короткие и пустые колонки сохраняют место независимо от длины соседнего текста.
      const promptTable = /^(промпт|prompt)$/i.test(head[0]);
      const widths = promptTable && head.length === 3 ? [26, 40, 34]
        : promptTable && head.length === 2 ? [30, 70] : head.map(() => 100 / head.length);
      blocks.push(
        <div key={i} className="min-w-0 overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: Math.max(420, head.length * 140) }}>
            <colgroup>{widths.map((width, j) => <col key={j} style={{ width: `${width}%` }} />)}</colgroup>
            <thead>
              <tr {...lineDiffProps(lineDiff?.[headRow.lineIndex])}>{head.map((h, j) => <th key={j} className={`border px-2 py-1.5 text-left font-medium [overflow-wrap:anywhere] ${lineDiff?.[headRow.lineIndex] ? '' : 'bg-muted'}`}>{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map(({ cells, lineIndex }, j) => (
                <tr key={j} {...lineDiffProps(lineDiff?.[lineIndex])}>{cells.map((c, n) => <td key={n} className="border px-2 py-1.5 align-top [overflow-wrap:anywhere]">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (heading) {
      const level = heading[1].length;
      const highlight = lineDiff?.[i];
      blocks.push(createElement(`h${level}`, { key: i, id: `${headingIdPrefix}-${lineOffset + i}`, ...(highlight ? { 'data-diff-kind': highlight } : {}), className: `${headingClass[level - 1]} ${lineDiffClass(highlight)} ${highlight ? 'rounded-sm px-2 py-1' : ''}` }, inline(heading[2])));
    } else if (line.startsWith('- ')) {
      const items: { text: string; lineIndex: number }[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) { items.push({ text: lines[i].slice(2), lineIndex: i }); i++; }
      i--;
      blocks.push(<ul key={i} className="list-disc space-y-1 pl-6 text-sm">{items.map(({ text, lineIndex }, j) => <li key={j} {...lineDiffProps(lineDiff?.[lineIndex])}>{inline(text)}</li>)}</ul>);
    } else if (orderedItem.test(line)) {
      const start = Number(orderedItem.exec(line)![1]);
      const items: { text: string; lineIndex: number }[] = [];
      while (i < lines.length && orderedItem.test(lines[i])) { items.push({ text: orderedItem.exec(lines[i]!)![2], lineIndex: i }); i++; }
      i--;
      blocks.push(<ol key={i} start={start} className="list-decimal space-y-1 pl-6 text-sm">{items.map(({ text, lineIndex }, j) => <li key={j} {...lineDiffProps(lineDiff?.[lineIndex])}>{inline(text)}</li>)}</ol>);
    } else {
      const para: { text: string; lineIndex: number }[] = [{ text: line, lineIndex: i }];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||- )/.test(lines[i + 1]) && !orderedItem.test(lines[i + 1])) { i++; para.push({ text: lines[i], lineIndex: i }); }
      blocks.push(<p key={i} className="text-sm">{para.map(({ text, lineIndex }, j) => <Fragment key={j}>{j > 0 && <br />}{lineDiff ? <span {...lineDiffProps(lineDiff[lineIndex])}>{inline(text)}</span> : inline(text)}</Fragment>)}</p>);
    }
  }
  return <div className="space-y-3">{blocks}</div>;
}
