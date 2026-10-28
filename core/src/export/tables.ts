import type { ProjectSpec, TransitionRow } from './model';
import { rangeText } from '../entity-types';
import { STRINGS, type SpecLang } from './i18n';

/** Содержимое ячейки таблицы: абзацы, нумерованный список или маркированный список «жирное: обычное». */
export type Cell =
  | { text: string[] }
  | { list: string[] }
  | { bullets: { bold: string; text: string }[] };

export interface Row {
  cells: (Cell | null)[];
  /** Сколько строк занимает первая ячейка (вертикальное объединение). null в следующих строках — продолжение. */
  span0?: number;
}

export interface TableDef {
  head: string[];
  /** Ширины колонок в процентах. */
  widths: number[];
  rows: Row[];
}

const text = (s: string): Cell => ({ text: s ? s.split(/\r?\n/) : [] });
const dash = (s: string): Cell => text(s.trim() ? s : '-');
const list = (items: string[]): Cell => ({ list: items });

const ref = (name: string) => `[${name}]`;

/** Колонки «фразы» и «паттерны» появляются, только если в проекте есть соответствующие данные; стоят рядом. Пустой проект — с колонкой фраз. */
export function intentsTable(spec: ProjectSpec, lang: SpecLang = 'ru'): TableDef {
  const [nameHead, phrasesHead, patternsHead, entitiesHead] = STRINGS[lang].intentsHead;
  const mode = spec.intentMode ?? 'both';
  if (mode === 'keywords') {
    return {
      head: [nameHead, STRINGS[lang].keywordsHead, STRINGS[lang].examplePhrasesHead, entitiesHead],
      widths: [18, 20, 40, 22],
      rows: spec.intents.map((i): Row => {
        // Фразы без распознанных ключевых слов в документ не попадают
        const recognized = i.phrases.flatMap((p, n) => (i.keywords?.[n]?.length ? [{ phrase: p, keywords: i.keywords[n].join(', ') }] : []));
        return {
          cells: [
            text(i.name),
            list(recognized.map((r) => r.keywords)),
            list(recognized.map((r) => r.phrase)),
            list(i.entities.map((e) => ref(e.name) + (e.required ? ` (${STRINGS[lang].required})` : ''))),
          ],
        };
      }),
    };
  }
  const hasPatterns = mode === 'patterns' || (mode === 'both' && spec.intents.some((i) => i.patterns.length > 0));
  const hasPhrases = mode === 'phrases' || (mode === 'both' && (spec.intents.some((i) => i.phrases.length > 0) || !hasPatterns));
  const values = [
    ...(hasPhrases ? [{ head: phrasesHead, pick: (i: ProjectSpec['intents'][number]) => i.phrases }] : []),
    ...(hasPatterns ? [{ head: patternsHead, pick: (i: ProjectSpec['intents'][number]) => i.patterns }] : []),
  ];
  const valuesWidth = 100 - 18 - 22;
  return {
    head: [nameHead, ...values.map((v) => v.head), entitiesHead],
    widths: [18, ...values.map(() => valuesWidth / values.length), 22],
    rows: spec.intents.map((i): Row => ({
      cells: [text(i.name), ...values.map((v) => list(v.pick(i))), list(i.entities.map((e) => ref(e.name) + (e.required ? ` (${STRINGS[lang].required})` : '')))],
    })),
  };
}

export function entitiesTable(spec: ProjectSpec, lang: SpecLang = 'ru'): TableDef {
  return {
    head: STRINGS[lang].entitiesHead,
    widths: [20, 18, 46, 16],
    rows: spec.entities.map((e) => {
      return {
        cells: [
          text(ref(e.name)),
          text([STRINGS[lang].entityTypes[e.type] ?? e.type, rangeText(e.type, e.range_min, e.range_max, STRINGS[lang])].filter(Boolean).join('\n')),
          e.type !== 'string'
            ? text('-')
            : {
                bullets: e.values.map((v) => ({
                  bold: v.synonyms.length ? `${v.value}:` : v.value,
                  text: v.synonyms.map((s) => `"${s}"`).join(', '),
                })),
              },
          text(e.multiple_values ? STRINGS[lang].yes : STRINGS[lang].no),
        ],
      };
    }),
  };
}

export function promptsTable(spec: ProjectSpec, lang: SpecLang = 'ru'): TableDef {
  return {
    head: STRINGS[lang].promptsHead,
    widths: [30, 70],
    rows: spec.prompts.map((p) => ({
      cells: [text(p.name), list(p.full_answers)],
    })),
  };
}

export function dependenciesTable(spec: ProjectSpec, lang: SpecLang = 'ru'): TableDef {
  return {
    head: STRINGS[lang].dependenciesHead,
    widths: [25, 30, 15, 30],
    rows: spec.dependencies.map((d) => ({
      cells: [text(d.scenario), text(d.name), text(d.type), d.values.length ? list(d.values) : dash('')],
    })),
  };
}

const transitionRow = (t: TransitionRow): Row => ({
  cells: [
    dash(t.state),
    dash(t.next_states),
    dash([t.intent, t.request_params].filter((x) => x && x.trim()).join('\n')),
    dash(t.condition),
    dash(t.system_action),
    dash(t.prompt ?? ''),
  ],
});
export const transitionsTable = (rows: TransitionRow[], lang: SpecLang = 'ru'): TableDef => ({
  head: STRINGS[lang].transitionHead,
  widths: [14, 20, 17, 17, 17, 15],
  rows: rows.map(transitionRow),
});

export const globalsTable = (rows: TransitionRow[], lang: SpecLang = 'ru'): TableDef => ({
  head: STRINGS[lang].globalHead,
  widths: [20, 22, 20, 20, 18],
  rows: rows.map((t): Row => ({
    cells: [
      dash(t.next_states),
      dash([t.intent, t.request_params].filter((x) => x && x.trim()).join('\n')),
      dash(t.condition),
      dash(t.system_action),
      dash(t.prompt ?? ''),
    ],
  })),
});
