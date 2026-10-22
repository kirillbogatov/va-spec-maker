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
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
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
