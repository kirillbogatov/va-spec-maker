import type { ProjectSpec, TransitionRow } from './model';
import { rangeText } from '../entity-types';
import { STRINGS, type SpecLang } from './i18n';
import { normalizeTaskLinks } from '../text-links';

/** Содержимое ячейки таблицы: абзацы, нумерованный список или маркированный список «жирное: обычное». */
export type Cell =
  | { text: string[]; links?: boolean }
  | { list: string[]; lead?: string; numbered?: boolean }
  | { bullets: { bold: string; text: string }[]; numbered?: boolean };

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

/** Вводная «Любое из» сохраняет смысл альтернатив и не является пунктом условия. */
const conditions = (value: string): Cell => {
  const items = value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!items.length || (items.length === 1 && items[0] === '-')) return dash('');
  const lead = Object.values(STRINGS).some((t) => t.anyOf === items[0]) ? items.shift() : undefined;
  return { list: items, numbered: true, ...(lead ? { lead } : {}) };
};

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
        const recognized = i.phrases.flatMap((p, n) => (i.keywords?.[n]?.length ? [{ phrase: p, keywords: i.keywords[n] }] : []));
        const seen = new Set<string>();
        const uniqueKeywords = recognized.filter(({ keywords }) => {
          const key = JSON.stringify([...new Set(keywords)].sort());
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).map(({ keywords }) => keywords.join(', '));
        return {
          cells: [
            text(i.name),
            list(uniqueKeywords),
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
          text(e.name),
          text([STRINGS[lang].entityTypes[e.type] ?? e.type, rangeText(e.type, e.range_min, e.range_max, STRINGS[lang])].filter(Boolean).join('\n')),
          e.type !== 'string'
            ? text('-')
            : {
                numbered: true,
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
    head: spec.splitPromptAnswers === true ? (lang === 'ru' ? ['Промпт', 'Полный ответ', 'Короткий ответ'] : ['Prompt', 'Full answer', 'Short answer']) : STRINGS[lang].promptsHead,
    widths: spec.splitPromptAnswers === true ? [26, 40, 34] : [30, 70],
    rows: spec.prompts.map((p) => ({
      cells: spec.splitPromptAnswers === true ? [text(p.name), list(p.full_answers), list(p.short_answers ?? [])] : [text(p.name), list([...p.full_answers, ...(p.short_answers ?? [])])],
    })),
  };
}

export function dependenciesTable(spec: ProjectSpec, lang: SpecLang = 'ru'): TableDef {
  return {
    head: STRINGS[lang].dependenciesHead,
    widths: [25, 30, 45],
    rows: spec.dependencies.map((d) => ({
      cells: [text(d.name), d.values.length ? list(d.values) : dash(''), dash(d.description ?? '')],
    })),
  };
}

const transitionRow = (t: TransitionRow): Row => ({
  cells: [
    dash(t.state),
    dash(t.next_states),
    dash([t.intent, t.request_params].filter((x) => x && x.trim()).join('\n')),
    conditions(t.condition),
    dash(t.system_action),
    dash(t.prompt ?? ''),
  ],
});
export const transitionsTable = (rows: TransitionRow[], lang: SpecLang = 'ru'): TableDef => ({
  head: STRINGS[lang].transitionHead,
  widths: [14, 20, 17, 17, 17, 15],
  rows: rows.map(transitionRow),
});

export interface ChangelogRow { scenario?: string; date?: string; task: string; author: string; description: string }

export const changelogTable = (rows: ChangelogRow[], lang: SpecLang = 'ru', withScenario = false): TableDef => ({
  head: withScenario ? STRINGS[lang].changelogProjectHead : STRINGS[lang].changelogHead,
  widths: withScenario ? [12, 18, 14, 14, 42] : [14, 18, 18, 50],
  rows: rows.map((r): Row => ({
    cells: [dash(r.date ?? ''), ...(withScenario ? [dash(r.scenario ?? '')] : []), { text: r.task.trim() ? normalizeTaskLinks(r.task).split(/\r?\n/) : ['-'], links: true }, dash(r.author), dash(r.description)],
  })),
});
