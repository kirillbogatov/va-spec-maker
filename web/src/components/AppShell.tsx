import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronDown, Copy, Files, LayoutGrid, MessageSquareText, PanelLeftOpen, PanelsTopLeft, ScrollText, Search, Shapes, SlidersHorizontal, KeyRound, Workflow, type LucideIcon } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { GlobalSaveStatus } from '@/components/GlobalSaveStatus';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { UserMenu } from '@/components/UserMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePath, useProjectId } from '@/hooks/project';
import { useIntentMode } from '@/lib/intentMode';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { PanelVisibilityContext } from '@/lib/panelVisibility';

type NavItem = { to: string; label: string; icon: LucideIcon; key: 'intents' | 'entities' | 'prompts' | 'deps' | 'keywords' | 'responseTemplates' | 'scenarioTemplates' };

const TEMPLATES: NavItem[] = [
  { to: '/templates/responses', label: 'Шаблоны ответов', icon: Files, key: 'responseTemplates' },
  { to: '/templates/scenarios', label: 'Шаблоны сценариев', icon: PanelsTopLeft, key: 'scenarioTemplates' },
];

const DICTIONARY: NavItem[] = [
  { to: '/lists/intents', label: 'Интенты', icon: MessageSquareText, key: 'intents' },
  { to: '/entities', label: 'Сущности', icon: Shapes, key: 'entities' },
  { to: '/lists/prompts', label: 'Промпты', icon: ScrollText, key: 'prompts' },
  { to: '/lists/keywords', label: 'Ключевые слова', icon: KeyRound, key: 'keywords' },
];

const EXTERNAL: NavItem[] = [
  { to: '/dependencies', label: 'Зависимости', icon: SlidersHorizontal, key: 'deps' },
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
  const responseTemplates = useQuery({ queryKey: ['response-templates', projectId], queryFn: () => api.responseTemplates.list(projectId) });
  const scenarioTemplates = useQuery({ queryKey: ['scenario-templates', projectId], queryFn: () => api.scenarioTemplates.list(projectId) });
  return {
    scenarios: scenarios.data ?? [],
    counts: {
      intents: intents.data?.length, entities: entities.data?.length, prompts: prompts.data?.length, deps: deps.data?.length,
      keywords: keywords.data?.length,
      responseTemplates: responseTemplates.data?.length, scenarioTemplates: scenarioTemplates.data?.length,
    },
  };
}

export function AppShell() {
  const path = usePath();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scenarios, counts } = useCounts();
  // Справочник «Концепты» нужен только в режиме описания интентов «Концепты»
  const keywordsMode = useIntentMode(useProjectId()) === 'keywords';
  const dictionary = DICTIONARY.filter((d) => d.key !== 'keywords' || keywordsMode);
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState({ dictionary: false, external: false, templates: true });
  const restoreButton = useRef<HTMLButtonElement>(null);
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
  const onDictionary = dictionary.some((d) => on(path(d.to)));
  const onExternal = EXTERNAL.some((d) => on(path(d.to)));
  const onTemplates = TEMPLATES.some((d) => on(path(d.to)));

  const renderGroup = (key: keyof typeof closedGroups, title: string, items: NavItem[], withDivider = false) => (
    <div className={cn('flex shrink-0 flex-col gap-0.5', withDivider && 'border-t border-border pt-3')}>
      {!collapsed && <button type="button" aria-expanded={!closedGroups[key]} aria-controls={`nav-group-${key}`}
        onClick={() => setClosedGroups(groups => ({ ...groups, [key]: !groups[key] }))}
        className="mb-1 flex min-h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <span>{title}</span><ChevronDown aria-hidden className={cn('size-3.5 shrink-0 transition-transform', closedGroups[key] && '-rotate-90')} />
      </button>}
      <div id={`nav-group-${key}`} className={cn('flex flex-col gap-0.5', !collapsed && closedGroups[key] && 'hidden')}>
      {items.map((d) => (
        <NavLink key={d.to} to={path(d.to)} onClick={() => setCollapsed(false)} title={d.label} aria-label={d.label} className={({ isActive }) => cn(itemClass(isActive || on(path(d.to))), collapsed && 'w-8 justify-center px-0')}>
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
    </div>
  );

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className={cn('hidden shrink-0 flex-col gap-4 overflow-hidden border-r bg-nav p-3 md:flex', collapsed ? 'w-16 items-center' : 'w-60')}>
        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between px-1')}>
          {collapsed ? (
            <button
              ref={restoreButton}
              type="button"
              aria-label="Развернуть меню и список"
              title="Развернуть меню и список"
              aria-expanded={false}
              onClick={() => setCollapsed(false)}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <PanelLeftOpen className="size-4" aria-hidden />
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight" title="Все проекты">
              <Logo className="size-7" />
              VA Spec Maker
            </Link>
          )}
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

        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" aria-label="Основная навигация">
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-border pb-3">
            <NavLink to={path('/scenarios')} onClick={() => setCollapsed(false)} title="Сценарии" aria-label="Сценарии" className={() => cn(itemClass(onScenarios), collapsed && 'w-8 justify-center px-0')}>
              <Workflow className="size-4" />
              {!collapsed && (
                <>
                  Сценарии
                  <span className="ml-auto text-xs tabular-nums text-faint">{scenarios.length}</span>
                </>
              )}
            </NavLink>
          </div>

          {renderGroup('dictionary', 'Словарь проекта', dictionary)}
          {renderGroup('external', 'Внешние зависимости', EXTERNAL, true)}
          {renderGroup('templates', 'Шаблоны', TEMPLATES, true)}

          <div className="min-h-0 flex-1" />
        </nav>

        <div className="flex shrink-0 flex-col gap-2 px-1">
          {!collapsed && <GlobalSaveStatus />}
          <UserMenu variant="sidebar" collapsed={collapsed} settingsTo={path('/settings')} />
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 bg-page">
        <PanelVisibilityContext.Provider value={{ collapsed, setCollapsed, restoreButton }}>
          <Outlet />
        </PanelVisibilityContext.Provider>
      </main>

      <nav aria-label="Основная навигация" className="grid shrink-0 grid-cols-7 border-t bg-nav pb-[env(safe-area-inset-bottom)] md:hidden">
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
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', onExternal && 'font-medium text-brand')} />}>
            <SlidersHorizontal className="size-5" /> Связи
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            {EXTERNAL.map((d) => (
              <DropdownMenuItem key={d.to} onClick={() => navigate(path(d.to))}>
                {d.label}
                {counts[d.key] !== undefined && <span className="ml-auto pl-4 text-xs text-muted-foreground">{counts[d.key]}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', onTemplates && 'font-medium text-brand')} />}>
            <Copy className="size-5" /> Шаблоны
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            {TEMPLATES.map(d => <DropdownMenuItem key={d.to} onClick={() => navigate(path(d.to))}><d.icon className="size-4" />{d.label}</DropdownMenuItem>)}
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
