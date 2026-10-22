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
