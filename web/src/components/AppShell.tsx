import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Anchor, BookOpen, LayoutGrid, MessageSquareText, PanelLeftClose, PanelLeftOpen, ScrollText, Search, Shapes, SlidersHorizontal, Workflow, type LucideIcon } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { GlobalSaveStatus } from '@/components/GlobalSaveStatus';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { UserMenu } from '@/components/UserMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePath, useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { useIntentMode } from '@/lib/intentMode';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

const DICTIONARY: { to: string; label: string; icon: LucideIcon; key: 'intents' | 'entities' | 'prompts' | 'deps' | 'keywords' }[] = [
  { to: '/lists/intents', label: 'Интенты', icon: MessageSquareText, key: 'intents' },
  { to: '/entities', label: 'Сущности', icon: Shapes, key: 'entities' },
  { to: '/lists/prompts', label: 'Промпты', icon: ScrollText, key: 'prompts' },
  { to: '/dependencies', label: 'Зависимости', icon: SlidersHorizontal, key: 'deps' },
  { to: '/lists/keywords', label: 'Концепты', icon: Anchor, key: 'keywords' },
];

const itemClass = (active: boolean) =>
  cn(
    'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    active && 'bg-accent font-medium text-foreground hover:bg-accent',
  );

function useCounts() {
  const projectId = useProjectId();
  const scenarios = useQuery({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId) });
  const intents = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });
  const entities = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });
  const prompts = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId) });
  const deps = useQuery({ queryKey: ['dependency-dictionary', projectId], queryFn: () => api.dependencyDictionary.list(projectId) });
  const keywords = useQuery({ queryKey: ['keywords', projectId], queryFn: () => api.keywords.list(projectId) });
  return {
    scenarios: scenarios.data ?? [],
    counts: { intents: intents.data?.length, entities: entities.data?.length, prompts: prompts.data?.length, deps: deps.data?.length, keywords: keywords.data?.length },
  };
}

export function AppShell() {
  const path = usePath();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scenarios, counts } = useCounts();
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      } catch {
        /* хранилище недоступно — состояние живёт до перезагрузки */
      }
      return !c;
    });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      setSearching(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const on = (m: string) => pathname === m || pathname.startsWith(`${m}/`);
  const onScenarios = on(path('/scenarios'));
  // Справочник концептов нужен только в режиме «Концепты»
  const mode = useIntentMode(useProjectId());
  const dictionary = DICTIONARY.filter((d) => d.key !== 'keywords' || mode === 'keywords');
  const onDictionary = dictionary.some((d) => on(path(d.to)));

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className={cn('hidden shrink-0 flex-col gap-4 overflow-hidden border-r bg-background p-3 md:flex', collapsed ? 'w-16 items-center' : 'w-60')}>
        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between px-1')}>
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight" title="Все проекты">
            <Logo className="size-7" />
            {!collapsed && 'VA Spec Maker'}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        {!collapsed && <ProjectSwitcher />}
        <button
          type="button"
          onClick={() => setSearching(true)}
          aria-label="Поиск"
          title="Поиск"
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-md border bg-muted/50 text-sm text-muted-foreground hover:bg-muted',
            collapsed ? 'w-8 justify-center' : 'px-2.5',
          )}
        >
          <Search className="size-4" />
          {!collapsed && (
            <>
              Поиск <kbd className="ml-auto rounded border bg-background px-1 font-mono text-[11px]">/</kbd>
            </>
          )}
        </button>

        <nav className="flex min-h-0 flex-1 flex-col gap-4" aria-label="Основная навигация">
          <div className="flex shrink-0 flex-col gap-0.5">
            {!collapsed && <span className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Словарь проекта</span>}
            {dictionary.map((d) => (
              <NavLink key={d.to} to={path(d.to)} title={d.label} aria-label={d.label} className={({ isActive }) => cn(itemClass(isActive || on(path(d.to))), collapsed && 'w-8 justify-center px-0')}>
                <d.icon className="size-4 shrink-0" />
                {!collapsed && (
                  <>
                    {d.label}
                    {counts[d.key] !== undefined && <span className="ml-auto text-xs tabular-nums text-faint">{counts[d.key]}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div className="flex shrink-0 flex-col gap-0.5 border-t border-border pt-3">
            <NavLink to={path('/scenarios')} title="Сценарии" aria-label="Сценарии" className={() => cn(itemClass(onScenarios), collapsed && 'w-8 justify-center px-0')}>
              <Workflow className="size-4" />
              {!collapsed && (
                <>
                  Сценарии
                  <span className="ml-auto text-xs tabular-nums text-faint">{scenarios.length}</span>
                </>
              )}
            </NavLink>
          </div>

          <div className="min-h-0 flex-1" />
        </nav>

        <div className="flex shrink-0 flex-col gap-2 px-1">
          {!collapsed && <GlobalSaveStatus />}
          <UserMenu variant="sidebar" collapsed={collapsed} settingsTo={path('/settings')} />
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 bg-page">
        <Outlet />
      </main>

      <nav aria-label="Основная навигация" className="grid shrink-0 grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <NavLink to={path('/scenarios')} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', onScenarios && 'font-medium text-brand')}>
          <Workflow className="size-5" /> Сценарии
        </NavLink>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', onDictionary && 'font-medium text-brand')} />}>
            <BookOpen className="size-5" /> Словарь
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            {dictionary.map((d) => (
              <DropdownMenuItem key={d.to} onClick={() => navigate(path(d.to))}>
                {d.label}
                {counts[d.key] !== undefined && <span className="ml-auto pl-4 text-xs text-muted-foreground">{counts[d.key]}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" onClick={() => setSearching(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
          <Search className="size-5" /> Поиск
        </button>
        <Link to="/" className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
          <LayoutGrid className="size-5" /> Проекты
        </Link>
        <UserMenu variant="tab" settingsTo={path('/settings')} />
      </nav>

      <CommandPalette open={searching} onOpenChange={setSearching} />
    </div>
  );
}
