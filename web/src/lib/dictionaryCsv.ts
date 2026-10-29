import { csvObjects, parseCsv, toCsv } from './csv';
import type { EntityType } from './entityTypes';

/** Многострочная ячейка → список непустых строк. */
const lines = (cell: string): string[] => cell.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const bool = (cell: string, empty: boolean): boolean => (cell.trim() ? /^(1|true|yes|да)$/i.test(cell.trim()) : empty);
const ENTITY_TYPES: EntityType[] = ['string', 'number', 'time', 'date', 'boolean'];

/** Колонки заголовка обязательны: без «name» файл не похож на справочник. */
function table(text: string, what: string): Record<string, string>[] {
  const rows = csvObjects(parseCsv(text));
  if (!rows.length) throw new Error(`В файле нет строк «${what}»`);
  if (!('name' in rows[0])) throw new Error('В заголовке файла нет колонки name');
  return rows;
}

export interface DependencyRow { name: string; description: string; values: string[] }
export const dependenciesToCsv = (items: DependencyRow[]) =>
  toCsv([['name', 'description', 'values'], ...items.map((d) => [d.name, d.description, d.values.join('\n')])]);
export const parseDependenciesCsv = (text: string): DependencyRow[] =>
  table(text, 'зависимостей').map((r) => ({ name: r.name.trim(), description: r.description ?? '', values: lines(r.values ?? '') }));

export interface PromptRow { name: string; answers: string[] }
export const promptsToCsv = (items: PromptRow[]) =>
  toCsv([['name', 'answers'], ...items.map((p) => [p.name, p.answers.join('\n')])]);
export const parsePromptsCsv = (text: string): PromptRow[] =>
  table(text, 'промптов').map((r) => ({ name: r.name.trim(), answers: lines(r.answers ?? '') }));

export interface EntityRow {
  name: string; description: string; type: EntityType; multiple_values: boolean; range_min: string; range_max: string;
  values: { value: string; synonyms: string[] }[];
}
/** Значения сущности — по строке в ячейке: «значение|синоним|синоним». */
export const entitiesToCsv = (items: EntityRow[]) =>
  toCsv([
    ['name', 'description', 'type', 'multiple_values', 'range_min', 'range_max', 'values'],
    ...items.map((e) => [
      e.name, e.description, e.type, String(e.multiple_values), e.range_min, e.range_max,
      e.values.map((v) => [v.value, ...v.synonyms].join('|')).join('\n'),
    ]),
  ]);
export const parseEntitiesCsv = (text: string): EntityRow[] =>
  table(text, 'сущностей').map((r) => {
    const type = r.type?.trim().toLowerCase() as EntityType;
    return {
      name: r.name.trim(), description: r.description ?? '', type: ENTITY_TYPES.includes(type) ? type : 'string',
      multiple_values: bool(r.multiple_values ?? '', false), range_min: (r.range_min ?? '').trim(), range_max: (r.range_max ?? '').trim(),
      values: lines(r.values ?? '').flatMap((l) => {
        const [value, ...synonyms] = l.split('|').map((s) => s.trim());
        return value ? [{ value, synonyms: synonyms.filter(Boolean) }] : [];
      }),
    };
  });

export interface IntentRow {
  name: string; enabled: boolean; comment: string; phrases: string[]; patterns: string[];
  /** Сущности интента; обязательные в файле помечены звёздочкой после названия. */
  entities: { name: string; required: boolean }[];
}
export const intentsToCsv = (items: IntentRow[]) =>
  toCsv([
    ['name', 'enabled', 'comment', 'phrases', 'patterns', 'entities'],
    ...items.map((i) => [
      i.name, String(i.enabled), i.comment, i.phrases.join('\n'), i.patterns.join('\n'),
      i.entities.map((e) => e.name + (e.required ? '*' : '')).join('\n'),
    ]),
  ]);
export const parseIntentsCsv = (text: string): IntentRow[] =>
  table(text, 'интентов').map((r) => ({
    name: r.name.trim(), enabled: bool(r.enabled ?? '', true), comment: r.comment ?? '', phrases: lines(r.phrases ?? ''), patterns: lines(r.patterns ?? ''),
    entities: lines(r.entities ?? '').map((l) => ({ name: l.replace(/\*$/, '').trim(), required: l.endsWith('*') })),
  }));
