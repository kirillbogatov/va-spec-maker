import { createAuth, type Session, type SessionStore, type UserRecord, type UserStore } from '@/lib/auth';

const DB = 'va-spec-maker-auth';
const STORE = 'users';

const tx = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const r = run(open.result.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    };
  });

const idbUserStore: UserStore = {
  all: () => tx<UserRecord[]>('readonly', (s) => s.getAll()),
  put: async (u) => void (await tx('readwrite', (s) => s.put(u))),
  remove: async (id) => void (await tx('readwrite', (s) => s.delete(id))),
};

const KEY = 'va-session';

const localSessionStore: SessionStore = {
  get() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null;
      return s && typeof s.userId === 'string' && typeof s.token === 'string' ? s : null;
    } catch {
      return null;
    }
  },
  set(s) {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      /* хранилище недоступно — вход не запомнится после перезагрузки */
    }
  },
};

export const auth = createAuth({ users: idbUserStore, session: localSessionStore });
