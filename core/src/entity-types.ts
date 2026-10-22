import { badRequest } from './errors';

export const ENTITY_TYPES = ['string', 'number', 'time', 'date', 'boolean'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  string: 'Строка',
  number: 'Число',
  time: 'Время',
  date: 'Дата',
  boolean: 'Логический',
};

export interface EntityKind {
  type: EntityType;
  range_min: string;
  range_max: string;
}

const RANGE_TYPES: EntityType[] = ['number', 'time', 'date'];

function validBound(type: EntityType, s: string): boolean {
  if (type === 'number') return /^-?\d+(\.\d+)?$/.test(s);
  if (type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Время и дата в каноническом виде сравниваются как строки. */
const greater = (type: EntityType, a: string, b: string) => (type === 'number' ? Number(a) > Number(b) : a > b);

export function rangeText(type: string, min: string, max: string): string {
  if (!RANGE_TYPES.includes(type as EntityType)) return '';
  if (min && max) return `от ${min} до ${max}`;
  if (min) return `от ${min}`;
  if (max) return `до ${max}`;
  return '';
}

const bound = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Читает тип и диапазон из тела запроса. Поля, которых в теле нет, берутся из current
 * (диапазон — только если тип не менялся).
 */
export function parseEntityKind(body: any, current?: EntityKind): EntityKind {
  const type = body?.type === undefined ? (current?.type ?? 'string') : body.type;
  if (!ENTITY_TYPES.includes(type)) throw badRequest('Неизвестный тип сущности');
  const same = !current || current.type === type;
  const range_min = body?.range_min === undefined ? (same ? (current?.range_min ?? '') : '') : bound(body.range_min);
  const range_max = body?.range_max === undefined ? (same ? (current?.range_max ?? '') : '') : bound(body.range_max);
  if (!RANGE_TYPES.includes(type)) {
    if (range_min || range_max) throw badRequest('Диапазон можно задать только для числа, времени и даты');
    return { type, range_min: '', range_max: '' };
  }
  for (const [label, v] of [['Начало диапазона', range_min], ['Конец диапазона', range_max]] as const) {
    if (v && !validBound(type, v)) throw badRequest(`${label} указано в неверном формате`);
  }
  if (range_min && range_max && greater(type, range_min, range_max)) {
    throw badRequest('Начало диапазона не может быть больше конца');
  }
  return { type, range_min, range_max };
}
