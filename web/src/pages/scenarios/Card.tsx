import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Секция формы: заголовок и действия снаружи, единственная рамка — у поля или таблицы. */
export function Card({ title, action, className, flush, children }: { title?: ReactNode; action?: ReactNode; className?: string; flush?: boolean; children: ReactNode }) {
  return (
    <section className={cn('min-w-0 space-y-2', className)}>
      {(title || action) && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="text-[15px] font-semibold text-balance">{title}</h2>}
          {action && <div className="flex min-w-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn('min-w-0', flush && 'overflow-hidden rounded-xl border bg-card')}>{children}</div>
    </section>
  );
}

/** Кнопка-действие в шапке карточки: «+ Добавить». */
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-brand outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
    >
      <Plus className="size-3.5" />
      {children}
    </button>
  );
}

/** Строка таблицы-сетки; колонки задаёт cols (применяются с md). */
export const ROW = 'grid gap-x-3 gap-y-2 border-t px-4 py-2.5 md:items-center';
