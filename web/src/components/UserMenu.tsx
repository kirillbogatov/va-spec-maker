import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, LogOut, RotateCcw, Settings, UserRound, Users } from 'lucide-react';
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
  projectName?: string;
  /** Адрес настроек проекта; пункт показывается, только когда проект открыт. */
  settingsTo?: string;
  userSettingsTo?: string;
}

/** Аватар с инициалами и меню профиля: настройки, смена пароля, пользователи (админ), выход. */
export function UserMenu({ variant, collapsed = false, projectName, settingsTo, userSettingsTo }: Props) {
  const navigate = useNavigate();
  const user = useUser();
  const { signOut } = useAuth();
  const [users, setUsers] = useState(false);
  const avatar = (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold uppercase text-primary-foreground">
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
        <DropdownMenuTrigger render={<button type="button" aria-label={`Профиль: ${user.login}`} title={projectName ? `${user.login} · ${projectName}` : user.login} className={triggerClass} />}>
          {avatar}
          {variant === 'sidebar' && !collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-medium leading-tight">{user.login}</span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">{ROLE_LABEL[user.role]}</span>
            </span>
          )}
          {variant === 'tab' && (
            <span>Профиль</span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={variant === 'header' ? 'end' : 'start'} side={variant === 'tab' ? 'top' : variant === 'header' ? 'bottom' : 'right'}>
          {(projectName || settingsTo) && (
            <>
              <DropdownMenuGroup>
                {projectName && <DropdownMenuLabel className="max-w-64 truncate" title={projectName}>{projectName}</DropdownMenuLabel>}
                {settingsTo && (
                  <DropdownMenuItem className="min-h-9" onClick={() => navigate(settingsTo)}>
                    <Settings className="size-4" /> Настройки проекта
                  </DropdownMenuItem>
                )}
                {settingsTo && (
                  <DropdownMenuItem className="min-h-9" onClick={() => navigate('/')}>
                    <LayoutGrid className="size-4" /> Сменить проект
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{user.login}</DropdownMenuLabel>
            {!DEMO && userSettingsTo && (
              <DropdownMenuItem className="min-h-9" onClick={() => navigate(userSettingsTo)}>
                <UserRound className="size-4" /> Настройки пользователя
              </DropdownMenuItem>
            )}
            {!DEMO && user.role === 'admin' && (
              <DropdownMenuItem className="min-h-9" onClick={() => setUsers(true)}>
                <Users className="size-4" /> Пользователи
              </DropdownMenuItem>
            )}
            {DEMO ? (
              <DropdownMenuItem className="min-h-9" onClick={resetDemo}>
                <RotateCcw className="size-4" /> Начать демо заново
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="min-h-9" onClick={() => void signOut()}>
                <LogOut className="size-4" /> Выйти
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {user.role === 'admin' && <UsersDialog open={users} onOpenChange={setUsers} />}
    </>
  );
}
