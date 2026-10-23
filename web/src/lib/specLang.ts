import { useEffect, useState } from 'react';

export type SpecLang = 'ru' | 'en';

export const SPEC_LANGS: { value: SpecLang; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

const EVENT = 'spec-lang-changed';
const storageKey = (projectId: number) => `specLang:${projectId}`;

export function readSpecLang(projectId: number): SpecLang {
  try {
    return localStorage.getItem(storageKey(projectId)) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

export function writeSpecLang(projectId: number, value: SpecLang): void {
  try {
    localStorage.setItem(storageKey(projectId), value);
  } catch {
    /* хранилище недоступно — настройка не сохранится */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Язык спецификации (предпросмотр и экспорт): хранится в браузере отдельно для каждого проекта. */
export function useSpecLang(projectId: number): SpecLang {
  const [v, setV] = useState(() => readSpecLang(projectId));
  useEffect(() => {
    const sync = () => setV(readSpecLang(projectId));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [projectId]);
  return v;
}
