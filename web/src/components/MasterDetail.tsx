import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { CirclePlus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MasterDetail({ list, children }: { list: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col bg-nav-2 text-nav-fg">{list}</aside>
      <section className="min-w-0 flex-1 overflow-y-auto bg-page p-4">{children}</section>
    </div>
  );
}

export function EmptyDetail({ text = 'Выберите элемент слева или создайте новый' }: { text?: string }) {
  return <p className="p-2 text-sm text-muted-foreground">{text}</p>;
}

/** Шапка тёмного списка: «⊕ Создать». */
export function ListHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex items-center border-b border-white/10 px-4 py-3">
      <button type="button" onClick={onCreate} className="inline-flex items-center gap-1.5 text-xs font-medium text-white hover:underline">
        <CirclePlus className="size-3.5" /> Создать
      </button>
    </div>
  );
}

/** Строка тёмного списка со ссылкой; справа — необязательный счётчик. */
export function ListItem({ to, children, count, dim }: { to: string; children: ReactNode; count?: ReactNode; dim?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-nav-fg hover:bg-white/5',
          isActive && 'bg-white/10',
          dim && 'opacity-50',
        )
      }
    >
      <span className="min-w-0 flex-1">{children}</span>
      {count !== undefined && <span className="shrink-0 text-xs font-semibold text-nav-muted">{count}</span>}
    </NavLink>
  );
}

export const listEmpty = 'px-4 py-3 text-sm text-nav-muted';
export const listSearch = 'border-transparent bg-white/10 text-nav-fg placeholder:text-nav-muted focus-visible:border-white/40 dark:bg-white/10';

/** Фильтр по названию для тёмного списка: поле появляется, когда элементов больше шести. */
export function useListFilter<T extends { name: string }>(items: T[]) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const filtered = t ? items.filter((i) => i.name.toLowerCase().includes(t)) : items;
  const search =
    items.length > 6 ? (
      <div className="relative px-3 pt-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 mt-1 size-3.5 -translate-y-1/2 text-nav-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Фильтр по названию"
          aria-label="Фильтр списка"
          className="h-8 w-full rounded-none bg-white/10 pl-7 pr-2 text-sm text-nav-fg outline-none placeholder:text-nav-muted focus-visible:ring-1 focus-visible:ring-white/40"
        />
      </div>
    ) : null;
  return { filtered, search, filtering: t !== '' };
}
