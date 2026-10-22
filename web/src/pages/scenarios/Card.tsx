import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Карточка сценария: заголовок 15px, действие справа, содержимое; flush — таблица от края до края. */
export function Card({ title, action, className, flush, children }: { title?: ReactNode; action?: ReactNode; className?: string; flush?: boolean; children: ReactNode }) {
  return (
    <section className={cn('rounded-xl border bg-card', className)}>
      {(title || action) && (
        <div className="flex min-h-10 items-center justify-between gap-3 px-4 pt-3 pb-1">
          {title && <h2 className="text-[15px] font-semibold text-balance">{title}</h2>}
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn(!flush && 'px-4 pb-4 pt-1')}>{children}</div>
    </section>
  );
}

/** Кнопка-действие в шапке карточки: «+ Добавить». */
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-brand outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
    >
      <Plus className="size-4" />
      {children}
    </button>
  );
}

/** Строка таблицы-сетки; колонки задаёт cols (применяются с md). */
export const ROW = 'grid gap-x-3 gap-y-2 border-t px-4 py-2.5 md:items-center';
export const HEAD = 'hidden border-t-0 py-2 text-xs font-medium text-muted-foreground md:grid';
