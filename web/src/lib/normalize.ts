import { useEffect, useState } from 'react';

const EVENT = 'normalize-changed';
const storageKey = (projectId: number) => `normalize:${projectId}`;

export function readNormalize(projectId: number): boolean {
  try {
    return localStorage.getItem(storageKey(projectId)) === '1';
  } catch {
    return false;
  }
}

export function writeNormalize(projectId: number, value: boolean): void {
  try {
    localStorage.setItem(storageKey(projectId), value ? '1' : '0');
  } catch {
    /* хранилище недоступно — настройка не сохранится */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Настройка «Нормализовать слова»: хранится в браузере отдельно для каждого проекта. */
export function useNormalize(projectId: number): boolean {
  const [v, setV] = useState(() => readNormalize(projectId));
  useEffect(() => {
    const sync = () => setV(readNormalize(projectId));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [projectId]);
  return v;
}
