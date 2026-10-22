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
