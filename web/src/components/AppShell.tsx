import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronDown, Copy, Files, MessageSquareText, PanelLeftOpen, PanelsTopLeft, ScrollText, Shapes, SlidersHorizontal, KeyRound, Workflow, type LucideIcon } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { GlobalSaveStatus } from '@/components/GlobalSaveStatus';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { UserMenu } from '@/components/UserMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePath, useProject, useProjectId } from '@/hooks/project';
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
  const { project } = useProject();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scenarios, counts } = useCounts();
  // Справочник «Концепты» нужен только в режиме описания интентов «Концепты»
  const keywordsMode = useIntentMode(useProjectId()) === 'keywords';
  const dictionary = DICTIONARY.filter((d) => d.key !== 'keywords' || keywordsMode);
  const [searching, setSearching] = useState(false);
  const compactEmbed = typeof window !== 'undefined' && window.self !== window.top && window.matchMedia('(max-width: 1440px)').matches;
  const [collapsed, setCollapsed] = useState(compactEmbed);
  const [closedGroups, setClosedGroups] = useState({ dictionary: false, templates: true });
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
  const onTemplates = TEMPLATES.some((d) => on(path(d.to)));

  const renderGroup = (key: keyof typeof closedGroups, title: string, items: NavItem[]) => (
    <div className="flex shrink-0 flex-col gap-1">
      {!collapsed && <button type="button" aria-expanded={!closedGroups[key]} aria-controls={`nav-group-${key}`}
        onClick={() => setClosedGroups(groups => ({ ...groups, [key]: !groups[key] }))}
        className="flex min-h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
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
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Logo className="size-7" />
              VA Spec Maker
            </span>
          )}
        </div>
        {!collapsed && <ProjectSwitcher />}

        <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto" aria-label="Основная навигация">
          <div className="flex shrink-0 flex-col gap-0.5">
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

          {renderGroup('dictionary', 'Справочники', dictionary)}
          {renderGroup('templates', 'Шаблоны', TEMPLATES)}

          <div className="min-h-0 flex-1" />
        </nav>

        <div className="flex shrink-0 flex-col gap-2 px-1">
          {!collapsed && <GlobalSaveStatus />}
          <UserMenu variant="sidebar" collapsed={collapsed} projectName={project?.name} settingsTo={path('/settings')} userSettingsTo={path('/user-settings')} />
        </div>
      </aside>

      <div className="flex shrink-0 items-center border-b bg-nav px-3 py-2 md:hidden">
        <ProjectSwitcher />
      </div>

      <main className="min-h-0 min-w-0 flex-1 bg-page">
        {compactEmbed ? <Outlet /> : (
          <PanelVisibilityContext.Provider value={{ collapsed, setCollapsed, restoreButton }}>
            <Outlet />
          </PanelVisibilityContext.Provider>
        )}
      </main>

      <nav aria-label="Основная навигация" className="grid shrink-0 grid-cols-4 border-t bg-nav pb-[env(safe-area-inset-bottom)] md:hidden">
        <NavLink to={path('/scenarios')} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', onScenarios && 'font-medium text-brand')}>
          <Workflow className="size-5" /> Сценарии
        </NavLink>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', onDictionary && 'font-medium text-brand')} />}>
            <BookOpen className="size-5" /> Справочники
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
          <DropdownMenuTrigger render={<button type="button" className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', onTemplates && 'font-medium text-brand')} />}>
            <Copy className="size-5" /> Шаблоны
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            {TEMPLATES.map(d => <DropdownMenuItem key={d.to} onClick={() => navigate(path(d.to))}><d.icon className="size-4" />{d.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <UserMenu variant="tab" projectName={project?.name} settingsTo={path('/settings')} userSettingsTo={path('/user-settings')} />
      </nav>

      <CommandPalette open={searching} onOpenChange={setSearching} />
    </div>
  );
}
