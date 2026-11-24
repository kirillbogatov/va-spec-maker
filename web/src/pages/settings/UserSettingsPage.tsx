import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { useAuth, useUser } from '@/hooks/useAuth';

export function UserSettingsPage() {
  const user = useUser();
  const { updateProfile } = useAuth();
  const [login, setLogin] = useState(user.login);
  const [email, setEmail] = useState(user.email ?? '');
  const [editing, setEditing] = useState<'login' | 'email' | null>(null);
  const [saving, setSaving] = useState<'login' | 'email' | null>(null);
  const [changePassword, setChangePassword] = useState(false);

  const save = async (field: 'login' | 'email') => {
    setSaving(field);
    try {
      await updateProfile(login, email);
      setLogin(login.trim());
      setEmail(email.trim().toLowerCase());
      setEditing(null);
      toast.success(field === 'login' ? 'Имя пользователя сохранено' : 'Email сохранен');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Настройки пользователя</h1>
        <div className="divide-y rounded-xl border bg-card text-card-foreground">
          <div className="grid gap-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center">
            <span id="user-settings-login-label" className="text-sm font-medium">Имя пользователя</span>
            {editing === 'login' ? (
              <Input id="user-settings-login" aria-labelledby="user-settings-login-label" autoComplete="username" autoFocus value={login} onChange={(event) => setLogin(event.target.value)} />
            ) : (
              <output aria-labelledby="user-settings-login-label" data-testid="user-settings-login-value" className="flex min-h-8 min-w-0 items-center truncate text-sm">{login || '—'}</output>
            )}
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              disabled={saving !== null || (editing !== null && editing !== 'login') || (editing === 'login' && !login.trim())}
              onClick={() => { if (editing === 'login') void save('login'); else setEditing('login'); }}
            >
              {saving === 'login' ? 'Сохранение…' : editing === 'login' ? 'Сохранить' : 'Изменить'}
            </Button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center">
            <span id="user-settings-email-label" className="text-sm font-medium">Email</span>
            {editing === 'email' ? (
              <Input id="user-settings-email" aria-labelledby="user-settings-email-label" type="email" autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
            ) : (
              <output aria-labelledby="user-settings-email-label" data-testid="user-settings-email-value" className="flex min-h-8 min-w-0 items-center truncate text-sm">{email || '—'}</output>
            )}
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              disabled={saving !== null || (editing !== null && editing !== 'email')}
              onClick={() => { if (editing === 'email') void save('email'); else setEditing('email'); }}
            >
              {saving === 'email' ? 'Сохранение…' : editing === 'email' ? 'Сохранить' : 'Изменить'}
            </Button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center">
            <h2 className="text-sm font-medium">Пароль</h2>
            <div />
            <Button className="w-fit" variant="outline" onClick={() => setChangePassword(true)}>Изменить пароль</Button>
          </div>
        </div>
        <ChangePasswordDialog open={changePassword} onOpenChange={setChangePassword} />
      </div>
    </div>
  );
}
