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
    } else if (line.startsWith('# ')) blocks.push(<h1 key={i} className="text-2xl font-semibold">{inline(line.slice(2))}</h1>);
    else if (line.startsWith('## ')) blocks.push(<h2 key={i} className="mt-4 text-lg font-semibold">{inline(line.slice(3))}</h2>);
    else if (line.startsWith('### ')) blocks.push(<h3 key={i} className="mt-3 text-base font-semibold">{inline(line.slice(4))}</h3>);
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
