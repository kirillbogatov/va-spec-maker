import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, RotateCcw, Settings, Users } from 'lucide-react';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { UsersDialog } from '@/components/UsersDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth, useUser } from '@/hooks/useAuth';
import { resetDemo } from '@/lib/backend';
import { DEMO } from '@/lib/demoMode';
import { cn } from '@/lib/utils';

const ROLE_LABEL = { admin: 'Администратор', user: 'Пользователь' } as const;

interface Props {
  variant: 'sidebar' | 'tab' | 'header';
  collapsed?: boolean;
  /** Адрес настроек проекта; пункт показывается, только когда проект открыт. */
  settingsTo?: string;
}

/** Аватар с инициалами и меню профиля: настройки, смена пароля, пользователи (админ), выход. */
export function UserMenu({ variant, collapsed = false, settingsTo }: Props) {
  const navigate = useNavigate();
  const user = useUser();
  const { signOut } = useAuth();
  const [password, setPassword] = useState(false);
  const [users, setUsers] = useState(false);
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
          {settingsTo && (
            <DropdownMenuItem className="min-h-9" onClick={() => navigate(settingsTo)}>
              <Settings className="size-4" /> Настройки
            </DropdownMenuItem>
          )}
          {!DEMO && (
            <DropdownMenuItem className="min-h-9" onClick={() => setPassword(true)}>
              <KeyRound className="size-4" /> Сменить пароль
            </DropdownMenuItem>
          )}
          {!DEMO && user.role === 'admin' && (
            <DropdownMenuItem className="min-h-9" onClick={() => setUsers(true)}>
              <Users className="size-4" /> Пользователи
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {DEMO ? (
            <DropdownMenuItem className="min-h-9" onClick={resetDemo}>
              <RotateCcw className="size-4" /> Начать демо заново
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="min-h-9" onClick={() => void signOut()}>
              <LogOut className="size-4" /> Выйти
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={password} onOpenChange={setPassword} />
      {user.role === 'admin' && <UsersDialog open={users} onOpenChange={setUsers} />}
    </>
  );
}
