import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, Plus, Search, TriangleAlert } from 'lucide-react';
import { type ObjectKind } from '@/components/TypeToken';
import { cn } from '@/lib/utils';

interface MasterDetailProps {
  list: ReactNode;
  children: ReactNode;
  /** Выбран ли элемент. На экранах уже md без выбора виден только список, с выбором — только деталь. Не задано — обе части друг под другом. */
  selected?: boolean;
  /** Обработчик кнопки «Назад к списку» (на мобильном). */
  onBack?: () => void;
  /** Деталь сама управляет отступами и прокруткой (например, страница со своей шапкой и вкладками). */
  flush?: boolean;
}

export function MasterDetail({ list, children, selected, onBack, flush }: MasterDetailProps) {
  const stacked = selected === undefined;
  return (
    <div className={cn('flex h-full min-h-0 flex-col md:flex-row', stacked && 'overflow-y-auto md:overflow-visible')}>
      <aside
        className={cn(
          'flex shrink-0 flex-col border-b bg-background text-foreground md:w-[272px] md:border-b-0 md:border-r',
          stacked ? 'max-h-[45vh] md:max-h-none' : 'min-h-0 flex-1 md:flex-none',
          selected && 'hidden md:flex',
        )}
      >
        {list}
      </aside>
      <section
        className={cn(
          'min-w-0 flex-1 bg-page',
          flush ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto p-4 md:p-6',
          selected === false && (flush ? 'hidden md:flex' : 'hidden md:block'),
        )}
      >
        {selected && onBack && (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              'mb-3 inline-flex h-10 shrink-0 items-center gap-1.5 self-start rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:hidden',
              flush ? 'mb-0 ml-2 mt-1' : '-ml-2',
            )}
          >
            <ArrowLeft className="size-4" /> Назад к списку
          </button>
        )}
        {flush ? <div className="min-h-0 flex-1">{children}</div> : children}
      </section>
    </div>
  );
}

export function EmptyDetail({ text = 'Выберите элемент слева или создайте новый' }: { text?: string }) {
  return <p className="p-2 text-sm text-muted-foreground">{text}</p>;
}

/** Шапка списка: компактная кнопка «+ Создать». */
export function ListHeader({ onCreate, label = 'Создать' }: { onCreate: () => void; label?: string }) {
  return (
    <div className="flex items-center justify-end gap-2 border-b px-3 py-2">
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-10 items-center gap-1 rounded-sm px-1 text-sm font-medium text-muted-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:h-8"
      >
        <Plus className="size-3.5" /> {label}
      </button>
    </div>
  );
}

/** Заголовок группы в списке (например, имя сценария). */
export function ListGroup({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <li role="presentation" className="flex items-center justify-between gap-2 px-4 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
      <span className="truncate">{children}</span>
      {count !== undefined && <span className="tabular-nums font-normal text-faint">{count}</span>}
    </li>
  );
}

interface ListItemProps {
  to: string;
  children: ReactNode;
  /** Счётчик справа (прежний вариант). */
  count?: ReactNode;
  dim?: boolean;
  /** Цветной квадрат типа слева. */
  kind?: ObjectKind;
  /** Мета справа: «3 фразы». */
  meta?: ReactNode;
  /** Предупреждение: мета выделяется цветом и значком. */
  warn?: boolean;
}

/** Строка списка со ссылкой; слева тип, справа мета или счётчик. */
export function ListItem({ to, children, count, dim, meta, warn }: ListItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex min-h-10 items-center gap-2 px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:min-h-8',
          isActive && 'bg-accent text-accent-foreground hover:bg-accent',
          dim && 'opacity-50',
        )
      }
    >
      <span className="min-w-0 flex-1">{children}</span>
      {meta !== undefined && (
        <span className={cn('flex shrink-0 items-center gap-1 text-xs font-normal tabular-nums', warn ? 'text-warning' : 'text-muted-foreground')}>
          {warn && <TriangleAlert className="size-3" aria-hidden />}
          {meta}
        </span>
      )}
      {count !== undefined && <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>}
    </NavLink>
  );
}

export const listEmpty = 'px-4 py-3 text-sm text-muted-foreground';
export const listSearch = 'bg-muted placeholder:text-muted-foreground';

/** Фильтр по названию списка: поле появляется, когда элементов больше шести. */
export function useListFilter<T extends { name: string }>(items: T[], where: string) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const filtered = t ? items.filter((i) => i.name.toLowerCase().includes(t)) : items;
  const search =
    items.length > 6 ? (
      <div className="relative px-3 pb-2 pt-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Искать в ${where}`}
          aria-label="Фильтр списка"
          className="h-10 w-full rounded-lg bg-muted pl-7 pr-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring md:h-8"
        />
      </div>
    ) : null;
  return { filtered, search, filtering: t !== '' };
}
