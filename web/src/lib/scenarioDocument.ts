import JSZip from 'jszip';
import { convertScenarioDocument } from '@va/core';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
/** Extracts text, headings and tables locally. Embedded objects and external links are never opened. */
export async function docxMarkdown(data: ArrayBuffer): Promise<string> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(data); } catch { throw new Error('Не удалось прочитать DOCX. Выберите документ Word (.docx).'); }
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('В файле отсутствует документ Word.');
  const xml = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Повреждён документ Word.');
  const children = (el: Element, name: string) => [...el.children].filter(c => c.namespaceURI === W && c.localName === name);
  const descendants = (el: Element, name: string) => [...el.getElementsByTagNameNS(W,name)];
  const content = (el: Element): string => [...el.childNodes].map(n => {
    if (!(n instanceof Element)) return '';
    if (n.namespaceURI === W && n.localName === 't') return n.textContent ?? '';
    if (n.namespaceURI === W && ['br','cr'].includes(n.localName)) return '\n';
    if (n.namespaceURI === W && n.localName === 'tab') return ' ';
    return content(n);
  }).join('');
  const out: string[] = [];
  const body = xml.getElementsByTagNameNS(W,'body')[0];
  if (!body) throw new Error('Документ Word пуст.');
  for (const el of body.children) {
    if (el.localName === 'p') {
      const text = content(el).trim();
      if (!text) continue;
      const style = descendants(el,'pStyle')[0]?.getAttributeNS(W,'val') ?? '';
      const outline = descendants(el,'outlineLvl')[0]?.getAttributeNS(W,'val');
      const heading = /heading([1-6])/i.exec(style)?.[1];
      const level = heading ? Number(heading) : outline != null ? Number(outline)+1 : /title/i.test(style) ? 1 : 0;
      out.push((level > 0 && level <= 6 ? '#'.repeat(level)+' ' : '') + text);
    } else if (el.localName === 'tbl') {
      const carry: string[] = [];
      const rows = children(el,'tr').map(tr => {
        const cells: string[] = [];
        for (const tc of children(tr,'tc')) {
          const merge = descendants(tc,'vMerge')[0];
          let text = children(tc,'p').map(content).join('\n');
          if (merge && merge.getAttributeNS(W,'val') !== 'restart' && !text.trim()) text = carry[cells.length] ?? '';
          carry[cells.length] = text;
          const span = Math.min(100, Number(descendants(tc,'gridSpan')[0]?.getAttributeNS(W,'val') ?? 1));
          for (let i=0;i<span;i++) cells.push(text.replace(/\|/g,'\\|').replace(/\n/g,'<br>'));
        }
        return '| '+cells.join(' | ')+' |';
      });
      if (rows.length) out.push([rows[0], '|'+children(children(el,'tr')[0],'tc').map(() => '---').join('|')+'|', ...rows.slice(1)].join('\n'));
    }
  }
  return out.join('\n\n');
}

export async function readScenarioFile(file: File) {
  if (/\.json$/i.test(file.name)) {
    try { return { dump: JSON.parse(await file.text()), warnings: [] as string[] }; }
    catch { throw new Error('Файл не является JSON.'); }
  }
  if (!/\.(md|docx)$/i.test(file.name)) throw new Error('Выберите файл .json, .md или .docx.');
  const text = /\.docx$/i.test(file.name) ? await docxMarkdown(await file.arrayBuffer()) : await file.text();
  return convertScenarioDocument(text, file.name.replace(/\.docx$/i,'.md'), { locateFile: () => wasmUrl });
}
