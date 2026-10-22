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

  const value = useMemo(() => ({ state, createAdmin, signIn, signOut }), [state, createAdmin, signIn, signOut]);
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
