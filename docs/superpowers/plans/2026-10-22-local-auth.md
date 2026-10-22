# Локальная авторизация Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть приложение экраном входа по логину и паролю (локальные пользователи в браузере), добавить в меню аватар профиля с выходом и администратору раздел управления пользователями.

**Architecture:** Вся логика в `web/src/lib/auth.ts` как фабрика `createAuth({ users, session, iterations, failDelayMs })` поверх абстрактных хранилищ (в тестах — память, в приложении — IndexedDB и localStorage из `authStores.ts`). React-слой: `AuthProvider`/`useAuth`, `AuthGate` (до входа не грузит базу проектов), `AuthPage`, `UserMenu` с диалогами смены пароля и управления пользователями. Серверный `core/` не меняется.

**Tech Stack:** TypeScript, React 19, Web Crypto (PBKDF2-SHA256), IndexedDB, vitest (environment `node`, тесты только `*.test.ts`), существующие `ui/*` компоненты (base-ui), lucide-react.

## Global Constraints

Спека: `docs/superpowers/specs/2026-10-22-local-auth-design.md`.

- Роли: `admin` и `user`. Проекты общие, права на проекты не различаются; пользователями управляет только админ.
- Первый пользователь создаётся на первом запуске и становится администратором. Свободной регистрации нет.
- Пользователи хранятся в отдельной базе IndexedDB `va-spec-maker-auth`, хранилище `users` (ключ `id`); с SQLite проектов и JSON-экспортом не пересекаются.
- Запись: `id`, `login`, `salt`, `passwordHash`, `role`, `sessionHash`, `createdAt`.
- Хеш: PBKDF2-SHA256, 310 000 итераций, случайная соль 16 байт, Web Crypto; сравнение за постоянное время.
- Сессия: токен 32 случайных байта, в записи хранится его SHA-256, в `localStorage` ключ `va-session` = `{userId, token}`; живёт до выхода. Выход, смена и сброс пароля сбрасывают `sessionHash`.
- Логин 3–32 символа (буквы, цифры, `._-`), уникален без учёта регистра; пароль не короче 8 символов. Тексты ошибок и интерфейса на русском.
- Нельзя удалить или понизить последнего администратора; нельзя удалить себя. При неверном логине/пароле одно общее сообщение и небольшая задержка.
- README и экран входа честно говорят: это защита интерфейса, а не данных.
- Никаких новых зависимостей.

## Структура файлов

- Create `web/src/lib/auth.ts` — логика: типы, хеширование, `createAuth`, `AuthError`, `memoryUserStore`, `memorySessionStore`.
- Create `web/src/lib/auth.test.ts` — тесты логики на памяти.
- Create `web/src/lib/authStores.ts` — `idbUserStore`, `localSessionStore`, готовый экземпляр `auth`.
- Create `web/src/hooks/useAuth.tsx` — `AuthProvider`, `useAuth`, `useUser`.
- Create `web/src/components/AuthGate.tsx` — гейт: загрузка, ошибка, экран входа, затем база проектов и приложение.
- Create `web/src/pages/auth/AuthPage.tsx` — вход / создание администратора.
- Create `web/src/components/UserMenu.tsx`, `ChangePasswordDialog.tsx`, `UsersDialog.tsx`.
- Modify `web/src/lib/backend.ts` (`ensureBackend`), `web/src/main.tsx`, `web/src/components/AppShell.tsx`, `web/src/pages/projects/ProjectsPage.tsx`, `README.md`.

---

### Task 1: Логика авторизации (`auth.ts`)

**Files:**
- Create: `web/src/lib/auth.ts`
- Test: `web/src/lib/auth.test.ts`

**Interfaces:**
- Produces:
  - `type Role = 'admin' | 'user'`
  - `interface UserRecord { id: string; login: string; salt: string; passwordHash: string; role: Role; sessionHash: string; createdAt: number }`
  - `interface PublicUser { id: string; login: string; role: Role; createdAt: number }`
  - `interface UserStore { all(): Promise<UserRecord[]>; put(u: UserRecord): Promise<void>; remove(id: string): Promise<void> }`
  - `interface Session { userId: string; token: string }`, `interface SessionStore { get(): Session | null; set(s: Session | null): void }`
  - `class AuthError extends Error`
  - `memoryUserStore(): UserStore`, `memorySessionStore(): SessionStore`
  - `createAuth(opts: { users: UserStore; session: SessionStore; iterations?: number; failDelayMs?: number })` с методами `hasUsers(): Promise<boolean>`, `createFirstAdmin(login, password): Promise<PublicUser>`, `login(login, password): Promise<PublicUser>`, `restoreSession(): Promise<PublicUser | null>`, `logout(): Promise<void>`, `changePassword(oldPassword, newPassword): Promise<void>`, `listUsers(): Promise<PublicUser[]>`, `addUser(login, password, role?): Promise<PublicUser>`, `resetPassword(userId, newPassword): Promise<void>`, `setRole(userId, role): Promise<void>`, `deleteUser(userId): Promise<void>`
  - `type Auth = ReturnType<typeof createAuth>`

- [ ] **Step 1: Написать падающие тесты**

Создать `web/src/lib/auth.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthError, createAuth, memorySessionStore, memoryUserStore, type Auth } from './auth';

let auth: Auth;
let users: ReturnType<typeof memoryUserStore>;
let session: ReturnType<typeof memorySessionStore>;

beforeEach(() => {
  users = memoryUserStore();
  session = memorySessionStore();
  auth = createAuth({ users, session, iterations: 1000, failDelayMs: 0 });
});

const reject = async (p: Promise<unknown>, message: RegExp) => {
  await expect(p).rejects.toBeInstanceOf(AuthError);
  await expect(p).rejects.toThrow(message);
};

describe('создание первого администратора', () => {
  it('создаёт администратора, открывает сессию и закрывает повторное создание', async () => {
    expect(await auth.hasUsers()).toBe(false);
    const u = await auth.createFirstAdmin('Admin', 'password1');
    expect(u).toMatchObject({ login: 'Admin', role: 'admin' });
    expect(await auth.hasUsers()).toBe(true);
    expect((await auth.restoreSession())?.id).toBe(u.id);
    await reject(auth.createFirstAdmin('other', 'password1'), /уже создан/i);
  });

  it('не хранит пароль открытым, соль у разных пользователей разная', async () => {
    await auth.createFirstAdmin('admin', 'password1');
    await auth.addUser('second', 'password1');
    const [a, b] = await users.all();
    expect(a.passwordHash).not.toContain('password1');
    expect(a.salt).not.toBe(b.salt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
});

describe('валидация', () => {
  it('проверяет логин и пароль', async () => {
    await reject(auth.createFirstAdmin('ab', 'password1'), /логин/i);
    await reject(auth.createFirstAdmin('bad login', 'password1'), /логин/i);
    await reject(auth.createFirstAdmin('admin', 'short'), /пароль/i);
  });

  it('логин уникален без учёта регистра', async () => {
    await auth.createFirstAdmin('Admin', 'password1');
    await reject(auth.addUser('admin', 'password1'), /занят/i);
  });
});

describe('вход и сессия', () => {
  beforeEach(async () => {
    await auth.createFirstAdmin('admin', 'password1');
    await auth.logout();
  });

  it('входит по логину без учёта регистра', async () => {
    expect((await auth.login('ADMIN', 'password1')).login).toBe('admin');
    expect(await auth.restoreSession()).not.toBeNull();
  });

  it('одинаково отвечает на неверный пароль и неизвестный логин', async () => {
    await reject(auth.login('admin', 'wrong-password'), /неверный логин или пароль/i);
    await reject(auth.login('nobody', 'password1'), /неверный логин или пароль/i);
  });

  it('после выхода сессия недействительна, даже если токен остался у клиента', async () => {
    await auth.login('admin', 'password1');
    const saved = session.get();
    await auth.logout();
    expect(await auth.restoreSession()).toBeNull();
    session.set(saved);
    expect(await auth.restoreSession()).toBeNull();
  });
});

describe('пароли', () => {
  beforeEach(async () => {
    await auth.createFirstAdmin('admin', 'password1');
  });

  it('смена пароля требует старый пароль и оставляет текущую сессию', async () => {
    await reject(auth.changePassword('wrong-password', 'newpassword1'), /текущий пароль/i);
    await auth.changePassword('password1', 'newpassword1');
    expect(await auth.restoreSession()).not.toBeNull();
    await auth.logout();
    await reject(auth.login('admin', 'password1'), /неверный/i);
    await auth.login('admin', 'newpassword1');
  });

  it('смена пароля завершает чужие сессии', async () => {
    const stale = session.get();
    await auth.changePassword('password1', 'newpassword1');
    session.set(stale);
    expect(await auth.restoreSession()).toBeNull();
  });

  it('админ сбрасывает пароль пользователя', async () => {
    const u = await auth.addUser('worker', 'password1');
    await auth.resetPassword(u.id, 'brandnew123');
    await auth.logout();
    await reject(auth.login('worker', 'password1'), /неверный/i);
    expect((await auth.login('worker', 'brandnew123')).login).toBe('worker');
  });
});

describe('управление пользователями', () => {
  let adminId: string;
  beforeEach(async () => {
    adminId = (await auth.createFirstAdmin('admin', 'password1')).id;
  });

  it('обычный пользователь не может управлять другими', async () => {
    await auth.addUser('worker', 'password1');
    await auth.logout();
    await auth.login('worker', 'password1');
    await reject(auth.listUsers(), /права администратора/i);
    await reject(auth.addUser('x1x', 'password1'), /права администратора/i);
  });

  it('нельзя удалить себя и понизить или удалить последнего администратора', async () => {
    await reject(auth.deleteUser(adminId), /себя/i);
    await reject(auth.setRole(adminId, 'user'), /последнего администратора/i);
    const second = await auth.addUser('second', 'password1', 'admin');
    await auth.setRole(second.id, 'user');
    await reject(auth.setRole(adminId, 'user'), /последнего администратора/i);
  });

  it('удаляет пользователя', async () => {
    const u = await auth.addUser('worker', 'password1');
    await auth.deleteUser(u.id);
    expect((await auth.listUsers()).map((x) => x.login)).toEqual(['admin']);
  });

  it('listUsers не отдаёт хеши', async () => {
    const [u] = await auth.listUsers();
    expect(Object.keys(u).sort()).toEqual(['createdAt', 'id', 'login', 'role']);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test -w web -- auth`
Expected: FAIL — не найден модуль `./auth`.

- [ ] **Step 3: Реализовать `auth.ts`**

Создать `web/src/lib/auth.ts`:

```ts
export type Role = 'admin' | 'user';

export interface UserRecord {
  id: string;
  login: string;
  salt: string;
  passwordHash: string;
  role: Role;
  sessionHash: string;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  login: string;
  role: Role;
  createdAt: number;
}

export interface UserStore {
  all(): Promise<UserRecord[]>;
  put(u: UserRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface Session {
  userId: string;
  token: string;
}

export interface SessionStore {
  get(): Session | null;
  set(s: Session | null): void;
}

/** Ошибка, текст которой можно показать пользователю как есть. */
export class AuthError extends Error {}

export const memoryUserStore = (): UserStore => {
  const m = new Map<string, UserRecord>();
  return {
    all: async () => [...m.values()].map((u) => ({ ...u })),
    put: async (u) => void m.set(u.id, { ...u }),
    remove: async (id) => void m.delete(id),
  };
};

export const memorySessionStore = (): SessionStore => {
  let s: Session | null = null;
  return { get: () => s, set: (v) => void (s = v) };
};

const ITERATIONS = 310_000;
const BAD_CREDENTIALS = 'Неверный логин или пароль';
const enc = new TextEncoder();

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toB64(new Uint8Array(bits));
}

async function sha256(text: string): Promise<string> {
  return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

/** Сравнение без раннего выхода: время не зависит от места первого расхождения. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const toPublic = (u: UserRecord): PublicUser => ({ id: u.id, login: u.login, role: u.role, createdAt: u.createdAt });

function checkLogin(login: string) {
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(login)) throw new AuthError('Логин: 3–32 символа, буквы, цифры и . _ -');
}
function checkPassword(password: string) {
  if (password.length < 8) throw new AuthError('Пароль должен быть не короче 8 символов');
}

interface Options {
  users: UserStore;
  session: SessionStore;
  iterations?: number;
  /** Пауза после неудачного входа. */
  failDelayMs?: number;
}

export function createAuth({ users, session, iterations = ITERATIONS, failDelayMs = 600 }: Options) {
  const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  async function hashPassword(password: string) {
    const salt = random(16);
    return { salt: toB64(salt), passwordHash: await pbkdf2(password, salt, iterations) };
  }

  /** Записывает новый токен сессии пользователю и в хранилище сессии. */
  async function openSession(u: UserRecord): Promise<UserRecord> {
    const token = toB64(random(32));
    const next = { ...u, sessionHash: await sha256(token) };
    await users.put(next);
    session.set({ userId: u.id, token });
    return next;
  }

  async function current(): Promise<UserRecord | null> {
    const s = session.get();
    if (!s) return null;
    const u = (await users.all()).find((x) => x.id === s.userId);
    if (!u || !u.sessionHash || !sameText(u.sessionHash, await sha256(s.token))) return null;
    return u;
  }

  async function requireUser(): Promise<UserRecord> {
    const u = await current();
    if (!u) throw new AuthError('Сессия истекла, войдите заново');
    return u;
  }

  async function requireAdmin(): Promise<UserRecord> {
    const u = await requireUser();
    if (u.role !== 'admin') throw new AuthError('Нужны права администратора');
    return u;
  }

  async function create(login: string, password: string, role: Role): Promise<UserRecord> {
    checkLogin(login);
    checkPassword(password);
    const all = await users.all();
    if (all.some((u) => u.login.toLowerCase() === login.toLowerCase())) throw new AuthError('Этот логин уже занят');
    const u: UserRecord = { id: crypto.randomUUID(), login, role, sessionHash: '', createdAt: Date.now(), ...(await hashPassword(password)) };
    await users.put(u);
    return u;
  }

  const adminCount = async () => (await users.all()).filter((u) => u.role === 'admin').length;

  async function find(id: string): Promise<UserRecord> {
    const u = (await users.all()).find((x) => x.id === id);
    if (!u) throw new AuthError('Пользователь не найден');
    return u;
  }

  return {
    hasUsers: async () => (await users.all()).length > 0,

    async createFirstAdmin(login: string, password: string): Promise<PublicUser> {
      if ((await users.all()).length > 0) throw new AuthError('Администратор уже создан');
      return toPublic(await openSession(await create(login, password, 'admin')));
    },

    async login(login: string, password: string): Promise<PublicUser> {
      const u = (await users.all()).find((x) => x.login.toLowerCase() === login.trim().toLowerCase());
      // Для неизвестного логина считаем хеш впустую, чтобы время ответа не выдавало, что пользователя нет.
      const hash = await pbkdf2(password, u ? fromB64(u.salt) : random(16), iterations);
      if (!u || !sameText(hash, u.passwordHash)) {
        await sleep(failDelayMs);
        throw new AuthError(BAD_CREDENTIALS);
      }
      return toPublic(await openSession(u));
    },

    async restoreSession(): Promise<PublicUser | null> {
      const u = await current();
      return u ? toPublic(u) : null;
    },

    async logout(): Promise<void> {
      const u = await current();
      if (u) await users.put({ ...u, sessionHash: '' });
      session.set(null);
    },

    async changePassword(oldPassword: string, newPassword: string): Promise<void> {
      const u = await requireUser();
      if (!sameText(await pbkdf2(oldPassword, fromB64(u.salt), iterations), u.passwordHash)) throw new AuthError('Неверный текущий пароль');
      checkPassword(newPassword);
      await openSession({ ...u, ...(await hashPassword(newPassword)) });
    },

    async listUsers(): Promise<PublicUser[]> {
      await requireAdmin();
      return (await users.all()).sort((a, b) => a.createdAt - b.createdAt).map(toPublic);
    },

    async addUser(login: string, password: string, role: Role = 'user'): Promise<PublicUser> {
      await requireAdmin();
      return toPublic(await create(login, password, role));
    },

    async resetPassword(userId: string, newPassword: string): Promise<void> {
      const me = await requireAdmin();
      checkPassword(newPassword);
      const target = await find(userId);
      const next = { ...target, ...(await hashPassword(newPassword)), sessionHash: '' };
      // Себе сброс не должен закрывать собственную сессию.
      if (target.id === me.id) await openSession(next);
      else await users.put(next);
    },

    async setRole(userId: string, role: Role): Promise<void> {
      await requireAdmin();
      const target = await find(userId);
      if (target.role === 'admin' && role !== 'admin' && (await adminCount()) <= 1) throw new AuthError('Нельзя понизить последнего администратора');
      await users.put({ ...target, role });
    },

    async deleteUser(userId: string): Promise<void> {
      const me = await requireAdmin();
      if (userId === me.id) throw new AuthError('Нельзя удалить себя');
      const target = await find(userId);
      if (target.role === 'admin' && (await adminCount()) <= 1) throw new AuthError('Нельзя удалить последнего администратора');
      await users.remove(userId);
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -w web -- auth`
Expected: PASS, все тесты `auth.test.ts` зелёные. Если TypeScript жалуется на `salt` в `deriveBits` (тип `Uint8Array<ArrayBufferLike>`), привести `salt as BufferSource`.

- [ ] **Step 5: Проверка типов и коммит**

Run: `npm run typecheck -w web`
Expected: без ошибок.

```bash
git add web/src/lib/auth.ts web/src/lib/auth.test.ts
git commit -m "feat(auth): локальная логика пользователей и сессий"
```

---

### Task 2: Хранилища браузера и React-слой (provider, гейт, экран входа)

**Files:**
- Create: `web/src/lib/authStores.ts`, `web/src/hooks/useAuth.tsx`, `web/src/components/AuthGate.tsx`, `web/src/pages/auth/AuthPage.tsx`
- Modify: `web/src/lib/backend.ts` (в конец), `web/src/main.tsx`

**Interfaces:**
- Consumes: `createAuth`, `UserStore`, `SessionStore`, `UserRecord`, `Session`, `PublicUser` из `@/lib/auth`.
- Produces:
  - `authStores.ts`: `export const auth` (экземпляр `createAuth` на IndexedDB и localStorage).
  - `useAuth(): { state: AuthState; createAdmin(login, password): Promise<void>; signIn(login, password): Promise<void>; signOut(): Promise<void>; setUser(u: PublicUser): void }`, где `AuthState = {status:'loading'} | {status:'setup'} | {status:'anonymous'} | {status:'error'; message: string} | {status:'authed'; user: PublicUser}`.
  - `useUser(): PublicUser` (бросает вне авторизованного состояния).
  - `backend.ts`: `ensureBackend(): Promise<void>` — однократная инициализация базы проектов.

- [ ] **Step 1: `authStores.ts`**

```ts
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
```

- [ ] **Step 2: `backend.ts` — однократный запуск**

Добавить в конец `web/src/lib/backend.ts`:

```ts
let starting: Promise<void> | undefined;
/** Открывает базу проектов один раз; повторные вызовы возвращают тот же промис. */
export const ensureBackend = (): Promise<void> => (starting ??= initBackend());
```

- [ ] **Step 3: `useAuth.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicUser } from '@/lib/auth';
import { auth } from '@/lib/authStores';

export type AuthState =
  | { status: 'loading' }
  | { status: 'setup' }
  | { status: 'anonymous' }
  | { status: 'error'; message: string }
  | { status: 'authed'; user: PublicUser };

interface Ctx {
  state: AuthState;
  createAdmin: (login: string, password: string) => Promise<void>;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: PublicUser) => void;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let off = false;
    (async () => {
      const user = await auth.restoreSession();
      if (off) return;
      if (user) setState({ status: 'authed', user });
      else setState({ status: (await auth.hasUsers()) ? 'anonymous' : 'setup' });
    })().catch((e: Error) => !off && setState({ status: 'error', message: e.message }));
    return () => {
      off = true;
    };
  }, []);

  const createAdmin = useCallback(async (login: string, password: string) => {
    setState({ status: 'authed', user: await auth.createFirstAdmin(login, password) });
  }, []);
  const signIn = useCallback(async (login: string, password: string) => {
    setState({ status: 'authed', user: await auth.login(login, password) });
  }, []);
  const signOut = useCallback(async () => {
    await auth.logout();
    setState({ status: 'anonymous' });
  }, []);
  const setUser = useCallback((user: PublicUser) => setState({ status: 'authed', user }), []);

  const value = useMemo(() => ({ state, createAdmin, signIn, signOut, setUser }), [state, createAdmin, signIn, signOut, setUser]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth вне AuthProvider');
  return c;
}

export function useUser(): PublicUser {
  const { state } = useAuth();
  if (state.status !== 'authed') throw new Error('Пользователь не вошёл');
  return state.user;
}
```

- [ ] **Step 4: `AuthPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';

/** Первый запуск: создание администратора. Дальше: вход по логину и паролю. */
export function AuthPage() {
  const { state, createAdmin, signIn } = useAuth();
  const setup = state.status === 'setup';
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (setup && password !== repeat) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      await (setup ? createAdmin(login.trim(), password) : signIn(login, password));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Logo className="size-8" />
          VA Spec Maker
        </div>
        <div>
          <h1 className="text-balance text-xl font-semibold">{setup ? 'Создайте администратора' : 'Вход'}</h1>
          {setup && <p className="mt-1 text-sm text-muted-foreground">Это первый запуск. Администратор сможет добавлять других пользователей.</p>}
        </div>
        <Input autoFocus placeholder="Логин" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
        <Input type="password" placeholder="Пароль" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        {setup && <Input type="password" placeholder="Повторите пароль" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !login.trim() || !password}>
          {setup ? 'Создать и войти' : 'Войти'}
        </Button>
        <p className="text-xs text-muted-foreground">Пользователи хранятся в этом браузере. Вход защищает интерфейс, но не шифрует данные проектов.</p>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: `AuthGate.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { ensureBackend } from '@/lib/backend';
import { AuthPage } from '@/pages/auth/AuthPage';

/** Пропускает к приложению только вошедших; базу проектов открывает после входа. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const authed = state.status === 'authed';

  useEffect(() => {
    if (!authed) {
      queryClient.clear();
      return;
    }
    let off = false;
    ensureBackend().then(
      () => !off && setReady(true),
      (e: Error) => !off && setFailure(e.message),
    );
    return () => {
      off = true;
    };
  }, [authed, queryClient]);

  if (state.status === 'error') return <p role="alert" className="p-6 text-destructive">Не удалось открыть хранилище пользователей: {state.message}</p>;
  if (failure) return <p role="alert" className="p-6 text-destructive">Не удалось открыть базу проектов: {failure}</p>;
  if (state.status === 'loading') return null;
  if (state.status !== 'authed') return <AuthPage />;
  return ready ? <>{children}</> : null;
}
```

- [ ] **Step 6: `main.tsx`**

Заменить файл целиком (импорт `initBackend` уходит, база открывается в `AuthGate`):

```tsx
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthGate } from '@/components/AuthGate';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/hooks/useAuth';
import App from './App';

const onError = (e: Error) => toast.error(e.message);
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthGate>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: Проверка**

Run: `npm run typecheck -w web && npm test -w web`
Expected: без ошибок, все тесты зелёные.

Вручную: `npm run dev`, открыть http://localhost:5173 в чистом профиле. Ожидается экран «Создайте администратора»; после создания — список проектов; после перезагрузки страницы вход сохраняется. Ранее созданные проекты на месте.

- [ ] **Step 8: Коммит**

```bash
git add web/src/lib/authStores.ts web/src/lib/backend.ts web/src/hooks/useAuth.tsx web/src/components/AuthGate.tsx web/src/pages/auth/AuthPage.tsx web/src/main.tsx
git commit -m "feat(auth): экран входа, гейт и хранилища пользователей"
```

---

### Task 3: Аватар в меню, выход и смена пароля

**Files:**
- Create: `web/src/components/UserMenu.tsx`, `web/src/components/ChangePasswordDialog.tsx`
- Modify: `web/src/components/AppShell.tsx`, `web/src/pages/projects/ProjectsPage.tsx`

**Interfaces:**
- Consumes: `useAuth`, `useUser` из `@/hooks/useAuth`; `auth` из `@/lib/authStores`.
- Produces: `UserMenu({ variant, collapsed? }: { variant: 'sidebar' | 'tab' | 'header'; collapsed?: boolean })`; `ChangePasswordDialog({ open, onOpenChange })`. В Task 4 в `UserMenu` добавляется пункт «Пользователи».

- [ ] **Step 1: `ChangePasswordDialog.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { auth } from '@/lib/authStores';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [oldPassword, setOld] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setOld('');
      setPassword('');
      setRepeat('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      await auth.changePassword(oldPassword, password);
      toast.success('Пароль изменён');
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сменить пароль</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <Input autoFocus type="password" placeholder="Текущий пароль" autoComplete="current-password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
          <Input type="password" placeholder="Новый пароль (от 8 символов)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input type="password" placeholder="Повторите новый пароль" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !oldPassword || !password}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `UserMenu.tsx`**

```tsx
import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth, useUser } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const ROLE_LABEL = { admin: 'Администратор', user: 'Пользователь' } as const;

interface Props {
  variant: 'sidebar' | 'tab' | 'header';
  collapsed?: boolean;
}

/** Аватар с инициалами и меню профиля: смена пароля, выход. */
export function UserMenu({ variant, collapsed = false }: Props) {
  const user = useUser();
  const { signOut } = useAuth();
  const [password, setPassword] = useState(false);
  const avatar = (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold uppercase text-primary-foreground">
      {user.login.slice(0, 2)}
    </span>
  );

  const triggerClass = {
    sidebar: cn('flex h-9 w-full items-center gap-2.5 rounded-md px-1.5 text-left text-sm hover:bg-muted', collapsed && 'size-9 justify-center px-0'),
    tab: 'flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
    header: 'grid size-9 place-items-center rounded-full hover:bg-muted',
  }[variant];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" aria-label={`Профиль: ${user.login}`} title={user.login} className={triggerClass} />}>
          {avatar}
          {variant === 'sidebar' && !collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-medium leading-tight">{user.login}</span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">{ROLE_LABEL[user.role]}</span>
            </span>
          )}
          {variant === 'tab' && 'Профиль'}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={variant === 'header' ? 'end' : 'start'} side={variant === 'tab' ? 'top' : variant === 'header' ? 'bottom' : 'right'}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {user.login} · {ROLE_LABEL[user.role]}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-9" onClick={() => setPassword(true)}>
            <KeyRound className="size-4" /> Сменить пароль
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-9" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={password} onOpenChange={setPassword} />
    </>
  );
}
```

- [ ] **Step 3: `AppShell.tsx`**

Добавить импорт `import { UserMenu } from '@/components/UserMenu';`.

Десктоп: последним ребёнком нижнего блока сайдбара (`<div className="flex shrink-0 flex-col gap-2 px-1">`, после `NavLink` «Настройки») добавить:

```tsx
          <UserMenu variant="sidebar" collapsed={collapsed} />
```

Мобильная нижняя навигация: в `className` заменить `grid-cols-4` на `grid-cols-5` и после ссылки «Проекты» (`</Link>`) добавить:

```tsx
        <UserMenu variant="tab" />
```

- [ ] **Step 4: `ProjectsPage.tsx`**

Добавить импорт `UserMenu` и в шапке справа от названия поставить аватар:

```tsx
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Logo className="size-8" />
            VA Spec Maker
          </span>
          <UserMenu variant="header" />
        </div>
```

- [ ] **Step 5: Проверка**

Run: `npm run typecheck -w web && npm test -w web`
Expected: чисто.

Вручную (`npm run dev`): аватар виден на странице проектов, в сайдбаре (развёрнутом и свёрнутом) и в нижней панели при ширине окна меньше 768px. «Сменить пароль» с неверным текущим паролем показывает ошибку, с верным закрывается, и после выхода нужен новый пароль. «Выйти» возвращает на экран входа; после повторного входа проекты на месте.

- [ ] **Step 6: Коммит**

```bash
git add web/src/components/UserMenu.tsx web/src/components/ChangePasswordDialog.tsx web/src/components/AppShell.tsx web/src/pages/projects/ProjectsPage.tsx
git commit -m "feat(auth): аватар профиля с выходом и сменой пароля"
```

---

### Task 4: Управление пользователями (админ)

**Files:**
- Create: `web/src/components/UsersDialog.tsx`
- Modify: `web/src/components/UserMenu.tsx`

**Interfaces:**
- Consumes: `auth.listUsers/addUser/resetPassword/setRole/deleteUser`, `PublicUser`, `Role`, `useUser`, `ConfirmDialog` (`open`, `onOpenChange`, `title`, `description?`, `confirmLabel?`, `onConfirm`).
- Produces: `UsersDialog({ open, onOpenChange })`.

- [ ] **Step 1: `UsersDialog.tsx`**

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useUser } from '@/hooks/useAuth';
import type { PublicUser, Role } from '@/lib/auth';
import { auth } from '@/lib/authStores';

const ROLE_LABEL = { admin: 'Администратор', user: 'Пользователь' } as const;

type Form = { kind: 'add' } | { kind: 'reset'; user: PublicUser } | null;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Список пользователей для администратора: добавить, сбросить пароль, сменить роль, удалить. */
export function UsersDialog({ open, onOpenChange }: Props) {
  const me = useUser();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [form, setForm] = useState<Form>(null);
  const [deleting, setDeleting] = useState<PublicUser | null>(null);

  const refresh = useCallback(() => auth.listUsers().then(setUsers).catch((e: Error) => toast.error(e.message)), []);
  useEffect(() => {
    if (open) {
      setForm(null);
      void refresh();
    }
  }, [open, refresh]);

  const run = (action: Promise<unknown>) => action.then(refresh).catch((e: Error) => toast.error(e.message));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form?.kind === 'add' ? 'Новый пользователь' : form?.kind === 'reset' ? `Новый пароль: ${form.user.login}` : 'Пользователи'}</DialogTitle>
        </DialogHeader>
        {form ? (
          <PasswordForm
            withLogin={form.kind === 'add'}
            onCancel={() => setForm(null)}
            onSubmit={async (login, password, role) => {
              if (form.kind === 'add') await auth.addUser(login, password, role);
              else await auth.resetPassword(form.user.id, password);
              setForm(null);
              await refresh();
            }}
          />
        ) : (
          <div className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {u.login}
                      {u.id === me.id && <span className="ml-2 text-xs font-normal text-muted-foreground">это вы</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Действия с пользователем ${u.login}`} />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="min-h-9" onClick={() => setForm({ kind: 'reset', user: u })}>
                        Сбросить пароль
                      </DropdownMenuItem>
                      <DropdownMenuItem className="min-h-9" onClick={() => run(auth.setRole(u.id, u.role === 'admin' ? 'user' : 'admin'))}>
                        {u.role === 'admin' ? 'Сделать пользователем' : 'Сделать администратором'}
                      </DropdownMenuItem>
                      {u.id !== me.id && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="min-h-9" variant="destructive" onClick={() => setDeleting(u)}>
                            Удалить
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
            <Button onClick={() => setForm({ kind: 'add' })}>
              <Plus className="size-4" /> Добавить пользователя
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Удалить пользователя «${deleting?.login ?? ''}»?`}
          description="Он больше не сможет войти. Проекты общие и останутся."
          onConfirm={() => deleting && run(auth.deleteUser(deleting.id))}
        />
      </DialogContent>
    </Dialog>
  );
}

function PasswordForm({ withLogin, onCancel, onSubmit }: { withLogin: boolean; onCancel: () => void; onSubmit: (login: string, password: string, role: Role) => Promise<void> }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(login.trim(), password, admin ? 'admin' : 'user');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      {withLogin && <Input autoFocus placeholder="Логин" autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} />}
      <Input autoFocus={!withLogin} type="text" placeholder="Пароль (от 8 символов)" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
      {withLogin && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Администратор
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Назад
        </Button>
        <Button type="submit" disabled={busy || !password || (withLogin && !login.trim())}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
```

Пароль в форме показывается открытым намеренно: администратор задаёт его и сообщает пользователю.

- [ ] **Step 2: Пункт «Пользователи» в `UserMenu.tsx`**

Добавить импорты `Users` из `lucide-react` и `UsersDialog` из `@/components/UsersDialog`, состояние `const [users, setUsers] = useState(false);`. Пункт меню между «Сменить пароль» и «Выйти»:

```tsx
          {user.role === 'admin' && (
            <DropdownMenuItem className="min-h-9" onClick={() => setUsers(true)}>
              <Users className="size-4" /> Пользователи
            </DropdownMenuItem>
          )}
```

И диалог рядом с `ChangePasswordDialog`:

```tsx
      {user.role === 'admin' && <UsersDialog open={users} onOpenChange={setUsers} />}
```

- [ ] **Step 3: Проверка**

Run: `npm run typecheck -w web && npm test -w web`
Expected: чисто.

Вручную: администратор добавляет «worker», выходит и входит как worker. Пункта «Пользователи» у worker нет, проекты общие видны. Администратор сбрасывает пароль worker и удаляет его. Попытка понизить единственного администратора показывает toast с ошибкой.

- [ ] **Step 4: Коммит**

```bash
git add web/src/components/UsersDialog.tsx web/src/components/UserMenu.tsx
git commit -m "feat(auth): управление пользователями для администратора"
```

---

### Task 5: Документация и финальная проверка

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

В раздел «Возможности» добавить пункт:

```
- Вход по логину и паролю: первый пользователь становится администратором и добавляет остальных; в меню есть профиль со сменой пароля и выходом.
```

В раздел «Данные и приватность» добавить абзац:

```
Пользователи и их пароли (в виде хешей) хранятся в этом же браузере, отдельно от проектов. Вход защищает интерфейс, но не шифрует данные: тот, кто имеет доступ к профилю браузера, может прочитать IndexedDB. Если администратор забыл пароль, восстановить его нельзя: очистите данные сайта в браузере и импортируйте проекты из JSON-копии.
```

- [ ] **Step 2: Полная проверка**

Run: `npm test && npm run build`
Expected: тесты `core` и `web` зелёные, сборка проходит.

- [ ] **Step 3: Коммит**

```bash
git add README.md
git commit -m "docs: авторизация в README"
```
