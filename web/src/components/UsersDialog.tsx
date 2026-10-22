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
