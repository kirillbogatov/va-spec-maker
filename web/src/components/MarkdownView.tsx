import { Fragment, type ReactNode } from 'react';

/** Минимальный рендер того Markdown, который выдаёт экспорт: заголовки, списки, таблицы, **жирный**, _курсив_, <br>. */
function inline(text: string): ReactNode[] {
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

const splitRow = (line: string) =>
  line.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());

export interface Heading { id: string; text: string; level: number; count: number }

const headingId = (i: number) => `md-h-${i}`;
const plain = (t: string) => t.replace(/\*\*|<br>/g, '').replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');

/** Заголовки документа для оглавления; count — число строк таблицы или пунктов списка в разделе. */
export function extractHeadings(source: string): Heading[] {
  const lines = source.split('\n');
  const out: Heading[] = [];
  lines.forEach((line, i) => {
    const m = /^(#{1,3}) (.*)$/.exec(line);
    if (m) out.push({ id: headingId(i), text: plain(m[2]), level: m[1].length, count: 0 });
    else if (out.length) {
      const h = out[out.length - 1];
      if (line.startsWith('- ')) h.count++;
      else if (line.startsWith('|') && !/^\|[-| ]+\|$/.test(line)) h.count++;
    }
  });
  // первая строка каждой таблицы — шапка
  let k = -1;
  lines.forEach((line, i) => {
    if (/^#{1,3} /.test(line)) k++;
    if (line.startsWith('|') && !lines[i - 1]?.startsWith('|') && k >= 0 && out[k]) out[k].count = Math.max(0, out[k].count - 1);
  });
  return out;
}

export function MarkdownView({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      const [head, ...body] = rows;
      blocks.push(
        <div key={i} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>{head.map((h, j) => <th key={j} className="border bg-muted px-2 py-1.5 text-left font-medium">{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, j) => (
                <tr key={j}>{r.map((c, n) => <td key={n} className="border px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith('# ')) blocks.push(<h1 key={i} id={headingId(i)} className="text-2xl font-semibold tracking-tight">{inline(line.slice(2))}</h1>);
    else if (line.startsWith('## ')) blocks.push(<h2 key={i} id={headingId(i)} className="mt-5 scroll-mt-4 border-b pb-1 text-lg font-semibold">{inline(line.slice(3))}</h2>);
    else if (line.startsWith('### ')) blocks.push(<h3 key={i} id={headingId(i)} className="mt-3 scroll-mt-4 text-base font-semibold">{inline(line.slice(4))}</h3>);
    else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      i--;
      blocks.push(<ul key={i} className="list-disc space-y-1 pl-6 text-sm">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
    } else {
      const para: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||- )/.test(lines[i + 1])) para.push(lines[++i]);
      blocks.push(<p key={i} className="text-sm">{para.map((t, j) => <Fragment key={j}>{j > 0 && <br />}{inline(t)}</Fragment>)}</p>);
    }
  }
  return <div className="space-y-3">{blocks}</div>;
}
