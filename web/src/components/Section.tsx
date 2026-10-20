import type { ReactNode } from 'react';
import { CirclePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Белая карточка на сером фоне: крупный заголовок, действие справа, содержимое. */
export function Section({ title, action, className, children }: SectionProps) {
  return (
    <section className={cn('rounded-sm bg-card px-5 py-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-4">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Ссылка-действие в правом верхнем углу карточки: «⊕ Добавить слот». */
export function SectionAction({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline disabled:pointer-events-none disabled:opacity-50"
    >
      <CirclePlus className="size-4" />
      {children}
    </button>
  );
}

/** Подпись над полем, как «Название» в референсе. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-0.5 block text-xs text-muted-foreground">{children}</span>;
}
