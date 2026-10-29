import { renderTableDocx, type Cell, type TableDef } from '@va/core';
import { api } from './api';
import type { DictKind } from './dictionaryTransfer';
import { downloadBlob } from './download';
import { entityTypeLabel, rangeSummary } from './entityTypes';

/** Справочники, которые выгружаются таблицей в docx и txt. */
export type DocKind = DictKind | 'keywords';

const TITLE: Record<DocKind, string> = { intents: 'Интенты', entities: 'Сущности', prompts: 'Промпты', dependencies: 'Зависимости', keywords: 'Ключевые слова' };

const text = (s: string): Cell => ({ text: s.trim() ? s.split(/\r?\n/) : [] });
const list = (items: string[]): Cell => ({ list: items.filter((s) => s.trim()) });

/** Содержимое справочника таблицей: одна строка — один объект. */
export async function dictionaryTable(kind: DocKind, pid: number): Promise<TableDef> {
  if (kind === 'keywords') {
    const items = await api.keywords.list(pid);
    return { head: ['Ключевое слово', 'Синонимы'], widths: [30, 70], rows: items.map((k) => ({ cells: [text(k.name), text(k.synonyms.join(', '))] })) };
  }
  if (kind === 'dependencies') {
    const items = await api.dependencyDictionary.list(pid);
    return {
      head: ['Зависимость', 'Описание', 'Значения'],
      widths: [25, 30, 45],
      rows: items.map((d) => ({ cells: [text(d.name), text(d.description), list(d.values)] })),
    };
  }
  if (kind === 'prompts') {
    const items = await Promise.all((await api.prompts.list(pid)).map((p) => api.prompts.get(p.id)));
    return { head: ['Промпт', 'Ответы'], widths: [30, 70], rows: items.map((p) => ({ cells: [text(p.name), list(p.full_answers)] })) };
  }
  if (kind === 'entities') {
    const items = await api.entities.list(pid);
    return {
      head: ['Сущность', 'Описание', 'Тип', 'Значения', 'Несколько значений'],
      widths: [16, 20, 14, 38, 12],
      rows: items.map((e) => ({
        cells: [
          text(e.name),
          text(e.description),
          text([entityTypeLabel(e.type), rangeSummary(e)].filter(Boolean).join('\n')),
          { bullets: e.values.map((v) => ({ bold: v.synonyms.length ? `${v.value}:` : v.value, text: v.synonyms.map((s) => `«${s}»`).join(', ') })) },
          text(e.multiple_values ? 'да' : 'нет'),
        ],
      })),
    };
  }
  const [listed, entities] = await Promise.all([api.intents.list(pid), api.entities.list(pid)]);
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const items = await Promise.all(listed.map((i) => api.intents.get(i.id)));
  // Паттерны — отдельной колонкой, только если они есть хоть у одного интента
  const patterns = items.some((i) => i.patterns.length > 0);
  return {
    head: ['Интент', 'Комментарий', 'Фразы', ...(patterns ? ['Паттерны'] : []), 'Сущности'],
    widths: patterns ? [16, 16, 30, 20, 18] : [18, 18, 44, 20],
    rows: items.map((i) => ({
      cells: [
        text(i.enabled ? i.name : `${i.name}\n(выключен)`),
        text(i.comment),
        list(i.phrases),
        ...(patterns ? [list(i.patterns)] : []),
        list(i.entities.flatMap((e) => (names.has(e.entity_id) ? [`${names.get(e.entity_id)}${e.required ? ' (обязательная)' : ''}`] : []))),
      ],
    })),
  };
}

const cellLines = (c: Cell | null): { lines: string[]; multi: boolean } => {
  if (!c) return { lines: [], multi: false };
  if ('text' in c) return { lines: c.text, multi: c.text.length > 1 };
  if ('list' in c) return { lines: c.list.map((s, i) => `${i + 1}. ${s}`), multi: true };
  return { lines: c.bullets.map((b) => `• ${b.bold}${b.text ? ` ${b.text}` : ''}`), multi: true };
};

/** Текстовая выгрузка: блок на объект — название и под ним заполненные колонки. */
export function tableToTxt(title: string, t: TableDef): string {
  const out = [`${title} (${t.rows.length})`, ''];
  for (const row of t.rows) {
    const [first, ...rest] = row.cells;
    out.push(cellLines(first).lines.join(' ') || '—');
    rest.forEach((c, i) => {
      const { lines, multi } = cellLines(c);
      if (!lines.length) return;
      if (multi) out.push(`  ${t.head[i + 1]}:`, ...lines.map((l) => `    ${l}`));
      else out.push(`  ${t.head[i + 1]}: ${lines[0]}`);
    });
    out.push('');
  }
  return out.join('\n');
}

export async function downloadDictionaryDoc(kind: DocKind, pid: number, format: 'txt' | 'docx'): Promise<void> {
  const table = await dictionaryTable(kind, pid);
  const blob = format === 'docx'
    ? await renderTableDocx(TITLE[kind], table)
    : new Blob([tableToTxt(TITLE[kind], table)], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${kind}.${format}`);
}
