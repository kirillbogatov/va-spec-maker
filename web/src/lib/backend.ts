import { createApp, DEMO_NAME, openDb, seedDemo, type App, type AppResponse, type Db } from '@va/core';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { DEMO } from '@/lib/demoMode';

const IDB = 'va-spec-maker';
const KEY = 'db';
let app: App;
let db: Db;
let timer: ReturnType<typeof setTimeout> | undefined;

const idb = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const r = run(open.result.transaction('kv', mode).objectStore('kv'));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    };
  });

// В демо база живёт в sessionStorage: переживает перезагрузку, но не закрытие вкладки.
const DEMO_KEY = 'va-demo-db';
const toB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const loadDemo = (): Uint8Array | undefined => {
  try {
    const v = sessionStorage.getItem(DEMO_KEY);
    return v ? Uint8Array.from(atob(v), (c) => c.charCodeAt(0)) : undefined;
  } catch {
    return undefined;
  }
};

const load = (): Promise<Uint8Array | undefined> =>
  DEMO ? Promise.resolve(loadDemo()) : idb<Uint8Array | undefined>('readonly', (s) => s.get(KEY)).catch(() => undefined);
const persist = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!DEMO) {
      idb('readwrite', (s) => s.put(db.serialize(), KEY)).catch(() => {});
      return;
    }
    try {
      sessionStorage.setItem(DEMO_KEY, toB64(db.serialize()));
    } catch {
      /* хранилище недоступно или переполнено — данные живут до перезагрузки */
    }
  }, 300);
};

/** Демо: стирает данные сессии и открывает свежий демо-проект. */
export function resetDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* нечего стирать */
  }
  location.reload();
}

/** Открывает БД из IndexedDB (или создаёт новую с демо-проектом). */
export async function initBackend(): Promise<void> {
  const data = await load();
  db = await openDb({ data, locateFile: () => wasmUrl });
  app = createApp(db);
  if (!data) {
    await seedDemo(app);
    storeDemoVersion();
    persist();
  } else if (!DEMO && readDemoVersion() !== __DEMO_VERSION__) {
    await refreshDemo();
  }
}

// Версия демо, с которой в этом браузере создан демо-проект; при выходе новой версии демо заменяется свежим.
const VERSION_KEY = 'va-demo-version';
const readDemoVersion = (): string | null => {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
};
const storeDemoVersion = () => {
  try {
    localStorage.setItem(VERSION_KEY, __DEMO_VERSION__);
  } catch {
    /* хранилище недоступно — демо обновится при следующем запуске */
  }
};

/** Заменяет демо-проекты (по названию) их актуальной версией; если демо в базе нет, ничего не добавляет. Правки пользователя в демо при этом теряются. */
async function refreshDemo(): Promise<void> {
  const list = await app.handle({ method: 'GET', url: '/api/projects' });
  const old = (list.body as { id: number; name: string }[]).filter((p) => p.name === DEMO_NAME);
  for (const p of old) await app.handle({ method: 'DELETE', url: `/api/projects/${p.id}` });
  if (old.length) {
    await seedDemo(app);
    persist();
  }
  storeDemoVersion();
}

export async function request(method: string, url: string, body?: unknown): Promise<AppResponse> {
  const r = await app.handle({ method, url, body });
  if (method !== 'GET' && r.status < 400) persist();
  return r;
}

let starting: Promise<void> | undefined;
/** Открывает базу проектов один раз; повторные вызовы возвращают тот же промис. */
export const ensureBackend = (): Promise<void> => (starting ??= initBackend());

/** Добавляет ещё один демо-проект в текущую БД. */
export async function addDemo(): Promise<void> {
  await seedDemo(app);
  persist();
}
