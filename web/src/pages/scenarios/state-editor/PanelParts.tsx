import type { ReactNode } from 'react';

/** Корень инспектора: разделы — карточки, как в диалоге правила. */
export function PanelRoot({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

/** Шапка инспектора: по высоте и отступам совпадает с тулбаром схемы. */
export function PanelHeader({ children }: { children: ReactNode }) {
  return <div className="-mx-4 -mt-4 flex items-center justify-between border-b px-2 py-1.5">{children}</div>;
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-brand">{title}</h3>
      {children}
    </section>
  );
}
