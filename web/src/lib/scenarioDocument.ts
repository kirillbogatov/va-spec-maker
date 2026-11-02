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

export const IMPORT_TYPES = 'JSON, MD, DOCX, PDF, HTML';
export const IMPORT_ACCEPT = '.json,application/json,.md,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,application/pdf,.html,.htm,text/html';

const escapeHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/** Reconstructs text PDF rows by their positions, retaining tables with recognizable column headers. */
export async function pdfHtml(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data });
  try {
    const doc = await task.promise;
    const out: string[] = [];
    let textCount = 0;
    for (let pageNo=1; pageNo<=doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const rows: { y: number; items: { x: number; width: number; text: string; size: number }[] }[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        textCount += item.str.length;
        const y = item.transform[5];
        let row = rows.find(r => Math.abs(r.y-y)<3);
        if (!row) { row={y,items:[]}; rows.push(row); }
        row.items.push({x:item.transform[4],width:item.width,text:item.str,size:Math.abs(item.transform[3])});
      }
      let columns: number[] | null = null;
      const endTable = () => { if (columns) out.push('</table>'); columns=null; };
      for (const row of rows.sort((a,b)=>b.y-a.y)) {
        const items = row.items.sort((a,b)=>a.x-b.x);
        const cells: {x:number; end:number; text:string}[] = [];
        for (const item of items) {
          const last=cells.at(-1);
          if (last && item.x-last.end<12) {last.text+=' '+item.text; last.end=item.x+item.width;}
          else cells.push({x:item.x,end:item.x+item.width,text:item.text});
        }
        const isHeader = cells.length>1 && /^(intent|интент|prompt|промпт|entity|сущност|parameter|из состояния|from state|state|в состояние|to state|date|дата|задача|task)/i.test(cells[0].text);
        if (isHeader) {
          endTable(); columns=cells.map(c=>c.x); out.push('<table><tr>'+cells.map(c=>'<th>'+escapeHtml(c.text)+'</th>').join('')+'</tr>');
        } else if (columns && items.length && (cells.length>1 || items[0].x>columns[0]+12)) {
          const values=columns.map(()=>'');
          for (const item of items) { let col=0; for(let i=1;i<columns.length;i++) if(item.x>=columns[i]-5) col=i; values[col]+=(values[col]?' ':'')+item.text; }
          out.push('<tr>'+values.map(v=>'<td>'+escapeHtml(v)+'</td>').join('')+'</tr>');
        } else {
          endTable();
          const text=cells.map(c=>c.text).join(' ');
          const tag=items[0]?.size>=17 ? 'h1' : items[0]?.size>=13 ? 'h2' : 'p';
          out.push('<'+tag+'>'+escapeHtml(text)+'</'+tag+'>');
        }
      }
      endTable(); page.cleanup();
    }
    if (!textCount) throw new Error('В PDF нет текстового слоя. Используйте PDF с распознанным текстом.');
    return out.join('\n');
  } finally { await task.destroy(); }
}

export async function readScenarioFile(file: File) {
  if (/\.json$/i.test(file.name)) {
    try { return { dump: JSON.parse(await file.text()), warnings: [] as string[] }; }
    catch { throw new Error('Файл не является JSON.'); }
  }
  if (!/\.(md|docx|pdf|html|htm)$/i.test(file.name)) throw new Error('Поддерживаются JSON, MD, DOCX, PDF, HTML.');
  const text = /\.docx$/i.test(file.name) ? await docxMarkdown(await file.arrayBuffer())
    : /\.pdf$/i.test(file.name) ? await pdfHtml(await file.arrayBuffer()) : await file.text();
  return convertScenarioDocument(text, file.name.replace(/\.(docx|pdf)$/i,'.md'), { locateFile: () => wasmUrl });
}
