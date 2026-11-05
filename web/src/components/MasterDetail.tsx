import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Plus, Search, TriangleAlert } from 'lucide-react';
import { type ObjectKind } from '@/components/TypeToken';
import { cn } from '@/lib/utils';
import { PanelVisibilityContext } from '@/lib/panelVisibility';

interface ListControls {
  listId: string;
  hide: () => void;
  hideButton: RefObject<HTMLButtonElement | null>;
}
const ListControlsContext = createContext<ListControls | null>(null);
const listToggleClass = 'hidden size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:inline-flex';

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

const MIN_WIDTH = 272;
const MAX_WIDTH = 720;
const WIDTH_KEY = 'master-width';

const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));

function useMasterWidth() {
  const [width, setWidth] = useState(() => {
    try {
      return clampWidth(Number(localStorage.getItem(WIDTH_KEY)) || MIN_WIDTH);
    } catch {
      return MIN_WIDTH;
    }
  });
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let last = startW;
    const move = (ev: PointerEvent) => {
      last = clampWidth(startW + ev.clientX - startX);
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(WIDTH_KEY, String(last));
      } catch {
        /* хранилище недоступно — ширина живёт до перезагрузки */
      }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { width, startDrag };
}

export function MasterDetail({ list, children, selected, onBack, flush }: MasterDetailProps) {
  const stacked = selected === undefined;
  const panels = useContext(PanelVisibilityContext);
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const listCollapsed = panels?.collapsed ?? localCollapsed;
  const setListCollapsed = panels?.setCollapsed ?? setLocalCollapsed;
  const listId = useId();
  const hideButton = useRef<HTMLButtonElement>(null);
  const localRestoreButton = useRef<HTMLButtonElement>(null);
  const restoreButton = panels?.restoreButton ?? localRestoreButton;
  const previousCollapsed = useRef(listCollapsed);
  const moveFocus = useRef(false);
  const toggleList = (collapsed: boolean) => {
    moveFocus.current = true;
    setListCollapsed(collapsed);
  };
  useLayoutEffect(() => {
    if (!moveFocus.current && previousCollapsed.current === listCollapsed) return;
    previousCollapsed.current = listCollapsed;
    (listCollapsed ? restoreButton.current : hideButton.current)?.focus();
    moveFocus.current = false;
  }, [listCollapsed]);
  const { width, startDrag } = useMasterWidth();
  return (
    <div className={cn('flex h-full min-h-0 flex-col md:flex-row', stacked && 'overflow-y-auto md:overflow-visible')}>
      <aside
        id={listId}
        style={{ '--master-w': `${width}px` } as CSSProperties}
        className={cn(
          'relative flex shrink-0 flex-col border-b bg-nav text-foreground md:w-[var(--master-w)] md:border-b-0 md:border-r',
          stacked ? 'max-h-[45vh] md:max-h-none' : 'min-h-0 flex-1 md:flex-none',
          selected && 'hidden',
          listCollapsed && selected !== false ? 'md:hidden' : 'md:flex',
        )}
      >
        <ListControlsContext.Provider value={selected !== false ? { listId, hide: () => toggleList(true), hideButton } : null}>
          {list}
        </ListControlsContext.Provider>
        <div onPointerDown={startDrag} aria-hidden className="absolute -right-1 top-0 z-10 hidden h-full w-2 cursor-col-resize touch-none md:block" />
      </aside>
      {!panels && listCollapsed && selected !== false && (
        <div className="hidden w-10 shrink-0 flex-col items-center border-r bg-nav py-2 md:flex">
          <button
            ref={restoreButton}
            type="button"
            aria-label="Показать список"
            title="Показать список"
            aria-controls={listId}
            aria-expanded={false}
            onClick={() => toggleList(false)}
            className={listToggleClass}
          >
            <PanelLeftOpen className="size-4" aria-hidden />
          </button>
        </div>
      )}
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
              flush ? 'mb-0 self-stretch rounded-none bg-nav px-4' : '-ml-2',
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
export function ListHeader({ onCreate, label = 'Создать', extra }: { onCreate: () => void; label?: string; extra?: ReactNode }) {
  const controls = useContext(ListControlsContext);
  return (
    <div className={cn('flex items-center gap-2 border-b px-3 py-2', extra ? 'justify-between' : 'justify-end')}>
      {extra}
      <button
        type="button"
        onClick={onCreate}
        className="ml-auto inline-flex h-10 shrink-0 items-center gap-1 rounded-sm px-1 text-sm font-medium text-muted-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:h-8"
      >
        <Plus className="size-3.5" /> {label}
      </button>
      {controls && (
        <button
          ref={controls.hideButton}
          type="button"
          aria-label="Скрыть список"
          title="Скрыть список"
          aria-controls={controls.listId}
          aria-expanded={true}
          onClick={controls.hide}
          className={listToggleClass}
        >
          <PanelLeftClose className="size-4" aria-hidden />
        </button>
      )}
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

/** Поиск по названию и дополнительным значениям в одном поле. */
export function useListFilter<T extends { name: string }>(items: T[], where: string, searchValues?: (item: T) => string[]) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const filtered = t ? items.filter((i) => [i.name, ...(searchValues?.(i) ?? [])].some((value) => value.toLowerCase().includes(t))) : items;
  const search =
    (searchValues ? items.length > 0 : items.length > 6) ? (
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
