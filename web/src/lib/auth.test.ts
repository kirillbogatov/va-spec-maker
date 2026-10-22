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
