import { useEffect, useState } from 'react';

export type PrefixKey = 'intent' | 'entity' | 'prompt' | 'dependency' | 'scenario';

export const PREFIX_FIELDS: { key: PrefixKey; label: string; hint: string }[] = [
  { key: 'intent', label: 'Интенты', hint: 'INT_' },
  { key: 'entity', label: 'Сущности', hint: 'ENT_' },
  { key: 'prompt', label: 'Промпты', hint: 'PRM_' },
  { key: 'dependency', label: 'Зависимости', hint: 'DEP_' },
  { key: 'scenario', label: 'Сценарии', hint: 'SCN_' },
];

const DEFAULTS: Record<PrefixKey, string> = { intent: 'INT_', entity: '', prompt: 'PRM_', dependency: '', scenario: '' };
const EVENT = 'prefixes-changed';
const storageKey = (projectId: number) => `prefixes:${projectId}`;

export function readPrefixes(projectId: number): Record<PrefixKey, string> {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? '{}');
    return { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePrefix(projectId: number, key: PrefixKey, value: string): void {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify({ ...readPrefixes(projectId), [key]: value }));
  } catch {
    /* хранилище недоступно — настройка не сохранится */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Префиксы названий новых объектов в проекте; хранятся в браузере отдельно для каждого проекта. */
export function usePrefixes(projectId: number): Record<PrefixKey, string> {
  const [v, setV] = useState(() => readPrefixes(projectId));
  useEffect(() => {
    const sync = () => setV(readPrefixes(projectId));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [projectId]);
  return v;
}
