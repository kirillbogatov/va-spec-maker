import { useEffect, useRef, useState } from 'react';
import { Bold, Code, CodeXml, Heading2, Italic, List, ListOrdered, Table2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Mode = 'visual' | 'markdown';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const code: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) { out.push(`<h${heading[1].length}>${inlineHtml(heading[2])}</h${heading[1].length}>`); i++; continue; }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim())); i++;
        if (rows.length === 1 && i < lines.length) i++;
      }
      const [head = [], ...body] = rows;
      out.push(`<table><thead><tr>${head.map((cell) => `<th>${inlineHtml(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${head.map((_, col) => `<td>${inlineHtml(row[col] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue;
    }
    const list = /^\s*(-|\*|\d+[.)])\s+/.exec(line);
    if (list) {
      const ordered = /^\d/.test(list[1]); const tag = ordered ? 'ol' : 'ul'; const items: string[] = [];
      while (i < lines.length && /^\s*(-|\*|\d+[.)])\s+/.test(lines[i])) items.push(`<li>${inlineHtml(lines[i].replace(/^\s*(-|\*|\d+[.)])\s+/, ''))}</li>`), i++;
      out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s|^```|^\s*(-|\*|\d+[.)])\s+/.test(lines[i]) && !lines[i].trim().startsWith('|')) paragraph.push(lines[i++]);
    out.push(`<p>${paragraph.map(inlineHtml).join('<br>')}</p>`);
  }
  return out.join('');
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\\/g, '\\\\').replace(/([*_`])/g, '\\$1');
  if (!(node instanceof HTMLElement)) return '';
  const content = Array.from(node.childNodes).map(inlineMarkdown).join('');
  if (node.tagName === 'STRONG' || node.tagName === 'B') return `**${content}**`;
  if (node.tagName === 'EM' || node.tagName === 'I') return `*${content}*`;
  if (node.tagName === 'CODE') return `\`${content}\``;
  if (node.tagName === 'BR') return '\n';
  return content;
}

function htmlToMarkdown(html: string): string {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const block = (node: Node): string => {
    if (!(node instanceof HTMLElement)) return inlineMarkdown(node);
    const tag = node.tagName.toLowerCase();
    if (tag === 'pre') return `\`\`\`\n${node.innerText.replace(/\n+$/, '')}\n\`\`\``;
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr')).map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => inlineMarkdown(cell).replace(/\n/g, ' ').replace(/\|/g, '\\|')));
      if (!rows.length) return '';
      const head = rows[0]; const separator = head.map(() => '---');
      return [head, separator, ...rows.slice(1)].map((row) => `| ${row.join(' | ')} |`).join('\n');
    }
    if (tag === 'ul' || tag === 'ol') return Array.from(node.children).map((item, index) => `${tag === 'ol' ? `${index + 1}.` : '-'} ${inlineMarkdown(item)}`).join('\n');
    const content = Array.from(node.childNodes).map(inlineMarkdown).join('').trim();
    if (!content) return '';
    if (/^h[1-3]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${content}`;
    return content;
  };
  return Array.from(root.childNodes).map(block).filter(Boolean).join('\n\n');
}

export function CustomSectionEditor({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const [mode, setMode] = useState<Mode>('visual');
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'visual' && visualRef.current) visualRef.current.innerHTML = markdownToHtml(value);
  }, [mode]);

  const syncVisual = () => {
    if (visualRef.current) onChange(htmlToMarkdown(visualRef.current.innerHTML));
  };
  const command = (action: string, argument?: string) => {
    visualRef.current?.focus();
    document.execCommand(action, false, argument);
    syncVisual();
  };
  const insertHtml = (html: string) => {
    visualRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    syncVisual();
  };

  const tools = [
    { label: 'Жирный', icon: <Bold />, run: () => command('bold') },
    { label: 'Курсив', icon: <Italic />, run: () => command('italic') },
    { label: 'Подзаголовок', icon: <Heading2 />, run: () => command('formatBlock', '<h3>') },
    { label: 'Маркированный список', icon: <List />, run: () => command('insertUnorderedList') },
    { label: 'Нумерованный список', icon: <ListOrdered />, run: () => command('insertOrderedList') },
    { label: 'Таблица', icon: <Table2 />, run: () => insertHtml('<table><tbody><tr><th>Заголовок 1</th><th>Заголовок 2</th></tr><tr><td>Ячейка</td><td>Ячейка</td></tr></tbody></table><p><br></p>') },
    { label: 'Код', icon: <Code />, run: () => { const selected = window.getSelection()?.toString() || 'код'; insertHtml(`<code>${escapeHtml(selected)}</code>`); } },
    { label: 'Блок кода', icon: <CodeXml />, run: () => insertHtml('<pre><code>код</code></pre><p><br></p>') },
  ];

  return <div className="mt-3 overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
    <div className="flex min-h-10 w-full items-center gap-0.5 border-b bg-muted/40 p-1">
      <div role="toolbar" aria-label="Форматирование содержимого" className="flex min-w-0 flex-1 items-center gap-0.5">
        {tools.map((item) => <Button key={item.label} type="button" variant="ghost" size="icon-sm" className="size-8 shrink-0" title={item.label} aria-label={item.label} disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={item.run}>{item.icon}</Button>)}
      </div>
      <div className="flex shrink-0 rounded-md border bg-background p-0.5" aria-label="Режим редактора">
        <Button type="button" variant={mode === 'visual' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 text-xs" aria-pressed={mode === 'visual'} onClick={() => setMode('visual')}><Eye className="mr-1 size-3.5" />Визуальный</Button>
        <Button type="button" variant={mode === 'markdown' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 text-xs" aria-pressed={mode === 'markdown'} onClick={() => setMode('markdown')}><CodeXml className="mr-1 size-3.5" />Разметка</Button>
      </div>
    </div>
    {mode === 'visual'
      ? <div ref={visualRef} role="textbox" aria-label={ariaLabel} aria-multiline="true" contentEditable suppressContentEditableWarning onInput={syncVisual} className="min-h-36 w-full overflow-auto px-2.5 py-2 text-sm outline-none [&_h3]:my-2 [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc" />
      : <Textarea rows={6} className="min-h-36 rounded-none border-0 bg-transparent font-normal placeholder:font-normal focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent" aria-label={`${ariaLabel} — разметка`} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Введите содержимое в формате Markdown" />}
  </div>;
}
