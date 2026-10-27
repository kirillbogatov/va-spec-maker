import { useEffect, useState } from 'react';
import type { ValueKind } from './values';

/** Как описывать интенты: только тренировочными фразами, только паттернами или тем и другим. */
export type IntentMode = 'phrases' | 'patterns' | 'both' | 'keywords';

export const INTENT_MODES: { value: IntentMode; label: string }[] = [
  { value: 'phrases', label: 'Тренировочные фразы' },
  { value: 'patterns', label: 'Паттерны' },
  { value: 'both', label: 'Тренировочные фразы + паттерны' },
  { value: 'keywords', label: 'Ключевые слова' },
];

/** Название списка значений интента (и колонки) в выбранном режиме. */
export const MODE_TITLE: Record<IntentMode, string> = { phrases: 'Тренировочные фразы', patterns: 'Паттерны', both: 'Значения', keywords: 'Ключевые слова' };

/** Пометка интента без значений в выбранном режиме. */
export const MODE_EMPTY: Record<IntentMode, string> = { phrases: 'нет фраз', patterns: 'нет паттернов', both: 'нет значений', keywords: 'нет фраз' };

/** Показывается ли значение этого типа в выбранном режиме. */
export const modeShows = (mode: IntentMode, kind: ValueKind) => mode === 'both' || (mode === 'patterns' ? kind === 'pattern' : kind === 'phrase');

/** Тип значений, добавляемых по умолчанию (в режиме «оба» пользователь выбирает сам). */
export const modeKind = (mode: IntentMode): ValueKind => (mode === 'patterns' ? 'pattern' : 'phrase');

const EVENT = 'intent-mode-changed';
const storageKey = (projectId: number) => `intentMode:${projectId}`;

export function readIntentMode(projectId: number): IntentMode {
  try {
    const v = localStorage.getItem(storageKey(projectId));
    return v === 'patterns' || v === 'both' || v === 'keywords' ? v : 'phrases';
  } catch {
    return 'phrases';
  }
}

export function writeIntentMode(projectId: number, value: IntentMode): void {
  try {
    localStorage.setItem(storageKey(projectId), value);
  } catch {
    /* хранилище недоступно — настройка не сохранится */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Настройка «Как описывать интенты»: хранится в браузере отдельно для каждого проекта. */
export function useIntentMode(projectId: number): IntentMode {
  const [v, setV] = useState(() => readIntentMode(projectId));
  useEffect(() => {
    const sync = () => setV(readIntentMode(projectId));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [projectId]);
  return v;
}
