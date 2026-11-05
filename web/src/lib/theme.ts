import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = Exclude<Theme, 'system'>;
interface ThemeState { theme: Theme; resolvedTheme: ResolvedTheme }
const STORAGE_KEY = 'specmaker.theme';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
const INITIAL_STATE: ThemeState = { theme: 'light', resolvedTheme: 'light' };
let current = INITIAL_STATE;

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'system' ? stored : 'light';
  }
  catch { return 'light'; }
}

function applyTheme(theme: Theme) {
  const resolvedTheme = theme === 'system' ? (window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light') : theme;
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  if (current.theme === theme && current.resolvedTheme === resolvedTheme) return;
  current = { theme, resolvedTheme };
  listeners.forEach((notify) => notify());
}

/** Применяется до первого рендера, в том числе на экране входа и в списке проектов. */
export function initializeTheme() {
  applyTheme(readTheme());
}

function setTheme(theme: Theme) {
  try { localStorage.setItem(STORAGE_KEY, theme); }
  catch { /* Выбор продолжает работать в текущем окне без доступа к хранилищу. */ }
  applyTheme(theme);
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const sync = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) applyTheme(readTheme());
  };
  window.addEventListener('storage', sync);
  const media = window.matchMedia(SYSTEM_QUERY);
  const syncSystem = () => { if (current.theme === 'system') applyTheme('system'); };
  media.addEventListener('change', syncSystem);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', sync);
    media.removeEventListener('change', syncSystem);
  };
}

export function useTheme() {
  const state = useSyncExternalStore(subscribe, () => current, () => INITIAL_STATE);
  return { ...state, setTheme };
}
