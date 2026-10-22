export type EntityType = 'string' | 'number' | 'time' | 'date' | 'boolean';
export interface EntityKind { type: EntityType; range_min: string; range_max: string }

export const DEFAULT_KIND: EntityKind = { type: 'string', range_min: '', range_max: '' };

export const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'string', label: 'Строка' },
  { value: 'number', label: 'Число' },
  { value: 'time', label: 'Время' },
  { value: 'date', label: 'Дата' },
  { value: 'boolean', label: 'Логический (true/false)' },
];

export const entityTypeLabel = (type: EntityType): string =>
  type === 'boolean' ? 'Логический' : (ENTITY_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type);

export const hasRange = (type: EntityType): boolean => type === 'number' || type === 'time' || type === 'date';

/** Время и дата в каноническом виде сравниваются как строки. */
export function rangeError({ type, range_min: min, range_max: max }: EntityKind): string | null {
  if (!hasRange(type) || !min || !max) return null;
  const inverted = type === 'number' ? Number(min) > Number(max) : min > max;
  return inverted ? 'Начало диапазона больше конца' : null;
}

export function rangeSummary({ type, range_min: min, range_max: max }: EntityKind): string {
  if (!hasRange(type)) return '';
  if (min && max) return `от ${min} до ${max}`;
  if (min) return `от ${min}`;
  if (max) return `до ${max}`;
  return '';
}
