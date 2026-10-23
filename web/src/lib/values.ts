export type ValueKind = 'phrase' | 'pattern';
export interface ValueItem { text: string; kind: ValueKind }

/** Тренировочные фразы и паттерны интента одним списком: сначала фразы, затем паттерны. */
export function mergeValues(phrases: string[], patterns: string[]): ValueItem[] {
  return [...phrases.map((text): ValueItem => ({ text, kind: 'phrase' })), ...patterns.map((text): ValueItem => ({ text, kind: 'pattern' }))];
}

export function splitValues(items: ValueItem[]): { phrases: string[]; patterns: string[] } {
  return {
    phrases: items.filter((x) => x.kind === 'phrase').map((x) => x.text),
    patterns: items.filter((x) => x.kind === 'pattern').map((x) => x.text),
  };
}

/** Часть интента, которую меняет редактор значений: общий список и производные от него фразы и паттерны. */
export const valuesPatch = (items: ValueItem[]) => ({ values: items, ...splitValues(items) });
