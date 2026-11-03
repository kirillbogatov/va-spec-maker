import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const MIN_WIDTH = 290;
const MAX_WIDTH = 640;
const STORAGE_KEY = 'scheme-properties-width';
const clamp = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));

export function PropertiesLayout({ children, inspector, wide }: { children: ReactNode; inspector: ReactNode; wide: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dragRight = useRef<number | null>(null);
  const [width, setWidth] = useState(() => {
    try { return clamp(Number(localStorage.getItem(STORAGE_KEY)) || MIN_WIDTH); } catch { return MIN_WIDTH; }
  });
  const update = (next: number) => {
    const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, (root.current?.clientWidth ?? 1200) * 0.55));
    const value = clamp(Math.min(max, next));
    setWidth(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* Ширина сохраняется в текущей сессии. */ }
  };
  return (
    <div ref={root} style={{ '--properties-width': `${width}px` } as CSSProperties} className={cn('grid gap-3 lg:grid-cols-[minmax(0,1fr)_min(var(--properties-width),55%)]', wide ? 'fixed inset-0 z-40 grid-rows-[minmax(0,1fr)_minmax(0,40dvh)] bg-page p-3 lg:grid-rows-1' : 'lg:h-[calc(100dvh-10rem)] lg:min-h-[28rem]')}>
      {children}
      <aside ref={panel} aria-label="Свойства" className="relative min-h-0 min-w-0 rounded-xl border bg-card lg:h-full">
        <div className="h-full overflow-y-auto rounded-xl p-4">{inspector}</div>
        <div
          role="separator" aria-orientation="vertical" aria-label="Ширина панели свойств"
          aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width} tabIndex={0}
          title="Потяните, чтобы изменить ширину (двойной клик — сбросить)"
          className="absolute inset-y-0 -left-2 z-10 hidden w-3 cursor-col-resize touch-none hover:bg-ring/10 focus-visible:bg-ring/20 focus-visible:outline-none active:bg-ring/20 lg:block"
          onPointerDown={(e) => { e.preventDefault(); dragRight.current = panel.current?.getBoundingClientRect().right ?? null; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (dragRight.current !== null) update(dragRight.current - e.clientX); }}
          onPointerUp={(e) => { dragRight.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }}
          onLostPointerCapture={() => { dragRight.current = null; }}
          onKeyDown={(e) => {
            const delta = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0;
            if (!delta && e.key !== 'Home' && e.key !== 'End') return;
            e.preventDefault();
            update(e.key === 'Home' ? MIN_WIDTH : e.key === 'End' ? MAX_WIDTH : width + delta);
          }}
          onDoubleClick={() => update(MIN_WIDTH)}
        />
      </aside>
    </div>
  );
}
