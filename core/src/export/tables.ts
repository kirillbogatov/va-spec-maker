import type { ProjectSpec, TransitionRow } from './model';

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

export const INTENTS_HEAD = ['Интент', 'Фразы для обучения', 'Сущности'];
export function intentsTable(spec: ProjectSpec): TableDef {
  return {
    head: INTENTS_HEAD,
    widths: [20, 50, 30],
    rows: spec.intents.map((i): Row => ({
      cells: [text(i.name), list(i.phrases), list(i.entities.map((e) => ref(e.name) + (e.required ? ' (обязательно)' : '')))],
    })),
  };
}

export const ENTITIES_HEAD = ['Сущность', 'Значения', 'Несколько значений', 'Обязательная', 'Уточняющий вопрос'];
export function entitiesTable(spec: ProjectSpec): TableDef {
  return {
    head: ENTITIES_HEAD,
    widths: [14, 36, 12, 10, 28],
    rows: spec.entities.map((e) => {
      const uses = spec.scenario_entities.filter((s) => s.name === e.name);
      const col = (f: (s: (typeof uses)[number]) => string): Cell => (uses.length ? text(uses.map(f).join('\n')) : dash(''));
      return {
        cells: [
          text(ref(e.name)),
          {
            bullets: e.values.map((v) => ({
              bold: v.synonyms.length ? `${v.value}:` : v.value,
              text: v.synonyms.map((s) => `"${s}"`).join(', '),
            })),
          },
          text(e.multiple_values || uses.some((s) => s.is_array) ? 'да' : 'нет'),
          col((s) => (s.required ? 'да' : 'нет')),
          col((s) => s.followup_prompt.trim() || '-'),
        ],
      };
    }),
  };
}

export const PROMPTS_HEAD = ['Промпт', 'Полный ответ', 'Краткий ответ'];
export function promptsTable(spec: ProjectSpec): TableDef {
  return {
    head: PROMPTS_HEAD,
    widths: [30, 40, 30],
    rows: spec.prompts.map((p) => ({
      cells: [text(p.name), list(p.full_answers), list(p.short_answers)],
    })),
  };
}

export const DEPENDENCIES_HEAD = ['Сценарий', 'Зависимость', 'Тип', 'Значения'];
export function dependenciesTable(spec: ProjectSpec): TableDef {
  return {
    head: DEPENDENCIES_HEAD,
    widths: [25, 30, 15, 30],
    rows: spec.dependencies.map((d) => ({
      cells: [text(d.scenario), text(d.name), text(d.type), d.values.length ? list(d.values) : dash('')],
    })),
  };
}

export const TRANSITION_HEAD = ['Из состояния', 'Запрос пользователя', 'Условия', 'Действие системы', 'В состояние', 'Ответ ассистента'];
const transitionRow = (t: TransitionRow): Row => ({
  cells: [
    dash(t.state),
    dash([t.intent, t.request_params].filter((x) => x && x.trim()).join('\n')),
    dash(t.condition),
    dash(t.system_action),
    dash(t.next_states),
    dash(t.prompt ?? ''),
  ],
});
export const transitionsTable = (rows: TransitionRow[]): TableDef => ({
  head: TRANSITION_HEAD,
  widths: [14, 17, 17, 17, 20, 15],
  rows: rows.map(transitionRow),
});
