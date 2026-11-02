import { createApp, DEMO_NAME, openDb, seedDemo, type App, type AppResponse, type Db } from '@va/core';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { DEMO } from '@/lib/demoMode';

const IDB = 'va-spec-maker';
const KEY = 'db';
let app: App;
let db: Db;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Запись в IndexedDB уже идёт: до её завершения закрывать вкладку небезопасно. */
let writing = 0;

/** Запрос к IndexedDB; результат отдаётся, когда транзакция зафиксирована (ошибка квоты всплывает только на фиксации). */
const idb = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const conn = open.result;
      try {
        const tx = conn.transaction('kv', mode);
        const r = run(tx.objectStore('kv'));
        tx.oncomplete = () => {
          conn.close();
          resolve(r.result);
        };
        tx.onerror = tx.onabort = () => {
          conn.close();
          reject(tx.error ?? r.error);
        };
      } catch (error) {
        conn.close();
        reject(error);
      }
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

// Ошибка чтения — не «пустая база»: иначе поверх настоящих данных запишется демо-проект.
const load = (): Promise<Uint8Array | undefined> =>
  DEMO ? Promise.resolve(loadDemo()) : idb<Uint8Array | undefined>('readonly', (s) => s.get(KEY));
const write = () => {
  timer = undefined;
  try {
    sessionStorage.setItem(DEMO_KEY, toB64(db.serialize()));
  } catch {
    /* хранилище недоступно или переполнено — данные живут до перезагрузки */
  }
};
const persist = () => {
  clearTimeout(timer);
  timer = setTimeout(write, 300);
};
// Перезагрузка или закрытие вкладки раньше, чем сработал отложенный сброс: записываем сразу, иначе последняя правка теряется.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    write();
  });
  // Пока данные не записаны в IndexedDB, браузер переспросит перед закрытием вкладки.
  window.addEventListener('beforeunload', (e) => {
    if (!DEMO && (timer !== undefined || writing > 0)) e.preventDefault();
  });
}

/** Уведомления передаются только после успешной фиксации базы. */
const changes = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('va-spec-maker-changes') : undefined;
const listeners = new Set<() => void>();
export function onBackendChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
if (changes) changes.onmessage = () => listeners.forEach((listener) => listener());
// Возврат в замороженную вкладку: BroadcastChannel мог не доставить уведомление.
if (typeof window !== 'undefined') window.addEventListener('focus', () => listeners.forEach((listener) => listener()));

/** Блокировка действует только на чтение → изменение → фиксацию, а не на жизнь вкладки.
 * Все запросы проходят через неё, в том числе запросы из одной вкладки. */
async function stored<T>(run: () => Promise<T>, save: (result: T) => boolean, committed?: () => void): Promise<T> {
  if (!navigator.locks) throw new Error('Для работы с базой нужен браузер с поддержкой Web Locks. Откройте приложение в актуальном браузере через HTTPS или localhost.');
  writing++;
  try {
    return await navigator.locks.request('va-spec-maker-db', async () => {
      const data = await load();
      db = await openDb({ data, locateFile: () => wasmUrl });
      app = createApp(db);
      try {
        if (!data) await seed();
        const result = await run();
        if (!data || save(result)) {
          await idb('readwrite', (s) => s.put(db.serialize(), KEY));
          changes?.postMessage('changed');
        }
        committed?.();
        return result;
      } finally {
        db.close();
      }
    });
  } finally {
    writing--;
  }
}

/** Демо: стирает данные сессии и открывает свежий демо-проект. */
export function resetDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* нечего стирать */
  }
  location.reload();
}

/** Создаёт демо-проект текущей версии. */
async function seed(): Promise<void> {
  await seedDemo(app);
}

/** Открывает БД из IndexedDB (или создаёт новую с демо-проектом). */
export async function initBackend(): Promise<void> {
  if (!DEMO) {
    navigator.storage?.persist?.().catch(() => {});
    await stored(async () => {
      if (readDemoVersion() === __DEMO_VERSION__) return false;
      await refreshDemo();
      return true;
    }, (changed) => changed, storeDemoVersion);
    return;
  }
  const data = await load();
  db = await openDb({ data, locateFile: () => wasmUrl });
  app = createApp(db);
  if (!data) {
    await seed();
    persist();
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
  }
}

export interface RequestOptions { expected?: unknown }

export async function request(method: string, url: string, body?: unknown, options?: RequestOptions): Promise<AppResponse> {
  const run = async (): Promise<AppResponse> => {
    // Сравниваем именно версию, из которой построен черновик, а не фоновый кэш.
    if (options && 'expected' in options) {
      const current = await app.handle({ method: 'GET', url });
      if (current.status >= 400 || JSON.stringify(current.body) !== JSON.stringify(options.expected)) {
        return { status: 409, headers: {}, body: {
          error: 'edit_conflict', message: 'Сценарий изменён в другой вкладке. Ваш черновик сохранён в редакторе. Выберите, какую версию оставить.',
          details: { current: current.status < 400 ? current.body : null },
        } };
      }
    }
    return app.handle({ method, url, body });
  };
  if (!DEMO) return stored(run, (r) => method !== 'GET' && r.status < 400);
  const r = await run();
  if (method !== 'GET' && r.status < 400) persist();
  return r;
}

let starting: Promise<void> | undefined;
/** Открывает базу проектов один раз; повторные вызовы возвращают тот же промис. */
export const ensureBackend = (): Promise<void> => (starting ??= initBackend());

/** Добавляет ещё один демо-проект в текущую БД. */
export async function addDemo(): Promise<void> {
  if (!DEMO) {
    await stored(seed, () => true);
    return;
  }
  await seed();
  persist();
}
