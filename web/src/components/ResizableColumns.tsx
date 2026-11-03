import { createContext, useContext, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react';

interface ColumnsContext {
  columns: string[];
  breakpoint: 'md' | 'xl';
  widths: number[] | null;
  update: (widths: number[], save?: boolean) => void;
  reset: () => void;
}
const Columns = createContext<ColumnsContext | null>(null);

/** One inherited template keeps the header and all loaded rows aligned. */
export function ResizableColumns({ storageKey, columns, initial, trailing = '', breakpoint = 'md', children, ...props }: {
  storageKey: string; columns: string[]; initial: string; trailing?: string; breakpoint?: 'md' | 'xl'; children: ReactNode;
} & Omit<React.ComponentProps<'section'>, 'children'>) {
  const key = `va-column-widths:${storageKey}`;
  const [widths, setWidths] = useState<number[] | null>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      return Array.isArray(saved) && saved.length === columns.length && saved.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0) ? saved : null;
    } catch { return null; }
  });
  const update = (next: number[], save = false) => {
    const total = next.reduce((sum, width) => sum + width, 0);
    const ratios = next.map((width) => width / total);
    setWidths(ratios);
    if (save) { try { localStorage.setItem(key, JSON.stringify(ratios)); } catch { /* Preferences may be unavailable. */ } }
  };
  const reset = () => {
    setWidths(null);
    try { localStorage.removeItem(key); } catch { /* Preferences may be unavailable. */ }
  };
  const template = widths ? [...widths.map((width) => `minmax(0,${width}fr)`), trailing].filter(Boolean).join(' ') : initial;
  return <Columns.Provider value={{ columns, breakpoint, widths, update, reset }}>
    <section {...props} style={{ ...props.style, '--resizable-columns': template } as CSSProperties}>{children}</section>
  </Columns.Provider>;
}

/** Separate from the sort button so resizing never toggles sorting. */
export function ColumnResizeHandle({ column, label }: { column: string; label: ReactNode }) {
  const context = useContext(Columns);
  const drag = useRef<{ x: number; widths: number[]; latest: number[] } | null>(null);
  if (!context) return null;
  const index = context.columns.indexOf(column);
  if (index < 0 || index >= context.columns.length - 1) return null;
  const measure = (element: HTMLElement) => {
    const header = element.closest('[role="columnheader"]')?.parentElement;
    if (!header || getComputedStyle(header).display !== 'grid') return null;
    const widths = getComputedStyle(header).gridTemplateColumns.split(/\s+/).map(parseFloat).slice(0, context.columns.length);
    return widths.length === context.columns.length && widths.every((n) => Number.isFinite(n) && n > 0) ? widths : null;
  };
  const resize = (widths: number[], delta: number) => {
    const next = [...widths];
    const leftMin = Math.min(96, widths[index]);
    const rightMin = Math.min(96, widths[index + 1]);
    const move = Math.max(leftMin - widths[index], Math.min(widths[index + 1] - rightMin, delta));
    next[index] += move;
    next[index + 1] -= move;
    return next;
  };
  const start = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    const widths = measure(e.currentTarget);
    if (!widths) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, widths, latest: widths };
  };
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    drag.current.latest = resize(drag.current.widths, e.clientX - drag.current.x);
    context.update(drag.current.latest);
  };
  const end = () => {
    if (!drag.current) return;
    context.update(drag.current.latest, true);
    drag.current = null;
  };
  const keyboard = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const widths = measure(e.currentTarget);
    if (!widths) return;
    e.preventDefault(); e.stopPropagation();
    context.update(resize(widths, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 40 : 16)), true);
  };
  return <span role="separator" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={context.widths ? Math.round(context.widths[index] * 100) : undefined} aria-label={`Изменить ширину колонки «${label}»`} tabIndex={0}
    title="Потяните для изменения ширины. Двойной щелчок — сброс. ← → — изменить с клавиатуры."
    className={`absolute -right-2 top-0 z-10 hidden h-full w-4 touch-none cursor-col-resize select-none items-center justify-center outline-none hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring ${context.breakpoint === 'xl' ? 'xl:flex' : 'md:flex'}`}
    onFocus={(e) => { const widths = measure(e.currentTarget); if (widths) context.update(widths); }}
    onPointerDown={start} onPointerMove={move} onPointerUp={end} onLostPointerCapture={end}
    onPointerCancel={() => { if (drag.current) context.update(drag.current.widths); drag.current = null; }}
    onKeyDown={keyboard} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.preventDefault(); context.reset(); }}>
    <span className="h-5 w-px bg-border" />
  </span>;
}
