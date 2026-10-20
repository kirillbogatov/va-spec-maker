import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { DICTIONARIES } from '@/pages/DictionariesLayout';
import { Search } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { GlobalSaveStatus } from '@/components/GlobalSaveStatus';
import { useProject } from '@/hooks/project';
import { cn } from '@/lib/utils';

const DICTIONARY_PREFIXES = DICTIONARIES.map((d) => d.to);

const linkClass = (isActive: boolean) =>
  cn(
    'flex h-8 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    isActive && 'bg-brand/10 text-brand hover:bg-brand/10 hover:text-brand',
  );

export function AppShell() {
  const { project, isLoading } = useProject();
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
  if (isLoading) return null;
  if (!project) return null;
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-brand">{project.name} VA Spec Maker</span>
          <nav className="ml-4 flex items-center gap-1" aria-label="Основная навигация">
            <NavLink to="/scenarios" className={linkClass(isActive('/scenarios'))}>
              Сценарии
            </NavLink>
            <NavLink to={DICTIONARIES[0].to} className={linkClass(DICTIONARY_PREFIXES.some(isActive))}>
              Справочники
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="inline-flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <Search className="size-4" /> Поиск <kbd className="rounded border bg-muted px-1 text-[11px]">Ctrl K</kbd>
          </button>
          <GlobalSaveStatus />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 bg-page">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searching} onOpenChange={setSearching} />
    </div>
  );
}
