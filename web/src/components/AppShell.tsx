import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Search, Workflow } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { GlobalSaveStatus } from '@/components/GlobalSaveStatus';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { usePath } from '@/hooks/project';
import { DICTIONARIES } from '@/pages/DictionariesLayout';
import { cn } from '@/lib/utils';

const linkClass = (isActive: boolean) =>
  cn(
    'flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    isActive && 'bg-brand/10 text-brand hover:bg-brand/10 hover:text-brand',
  );

export function AppShell() {
  const path = usePath();
  const { pathname } = useLocation();
  const isActive = (m: string) => pathname === m || pathname.startsWith(`${m}/`);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching((s) => !s);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="flex h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b bg-background p-4 md:w-60 md:border-b-0 md:border-r">
        <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white">V</span>
          VA Spec Maker
        </Link>
        <ProjectSwitcher />
        <nav className="flex gap-1 md:flex-col" aria-label="Основная навигация">
          <NavLink to={path('/scenarios')} className={linkClass(isActive(path('/scenarios')))}>
            <Workflow className="size-4" /> Сценарии
          </NavLink>
          <NavLink to={path(DICTIONARIES[0].to)} className={linkClass(DICTIONARIES.some((d) => isActive(path(d.to))))}>
            <BookOpen className="size-4" /> Справочники
          </NavLink>
        </nav>
        <div className="mt-auto hidden flex-col gap-3 md:flex">
          <GlobalSaveStatus />
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            <Search className="size-4" /> Поиск <kbd className="ml-auto rounded border bg-muted px-1 text-[11px]">Ctrl K</kbd>
          </button>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 bg-page">
        <Outlet />
      </main>
      <CommandPalette open={searching} onOpenChange={setSearching} />
    </div>
  );
}
