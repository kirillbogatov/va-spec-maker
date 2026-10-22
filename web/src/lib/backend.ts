import { createApp, openDb, seedDemo, type App, type AppResponse, type Db } from '@va/core';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

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

const load = (): Promise<Uint8Array | undefined> => idb<Uint8Array | undefined>('readonly', (s) => s.get(KEY)).catch(() => undefined);
const persist = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    idb('readwrite', (s) => s.put(db.serialize(), KEY)).catch(() => {});
  }, 300);
};

/** Открывает БД из IndexedDB (или создаёт новую с демо-проектом). */
export async function initBackend(): Promise<void> {
  const data = await load();
  db = await openDb({ data, locateFile: () => wasmUrl });
  app = createApp(db);
  if (!data) {
    await seedDemo(app);
    persist();
  }
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
