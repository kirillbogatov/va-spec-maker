import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ObjectKind = 'intent' | 'entity' | 'prompt' | 'state' | 'dependency' | 'keyword';

const TONE: Record<ObjectKind, string> = {
  intent: 'bg-int-bg text-int',
  entity: 'bg-ent-bg text-ent',
  prompt: 'bg-prm-bg text-prm',
  state: 'bg-st-bg text-st',
  dependency: 'bg-dep-bg text-dep',
  keyword: 'bg-kw-bg text-kw',
};
const DOT: Record<ObjectKind, string> = {
  intent: 'bg-int',
  entity: 'bg-ent',
  prompt: 'bg-prm',
  state: 'bg-st',
  dependency: 'bg-dep',
  keyword: 'bg-kw',
};

export const KIND_LABEL: Record<ObjectKind, string> = {
  intent: 'Интент',
  entity: 'Сущность',
  prompt: 'Промпт',
  state: 'Состояние',
  dependency: 'Зависимость',
  keyword: 'Концепт',
};

/** Жетон идентификатора: цвет задаёт тип объекта, шрифт моноширинный. Одинаков в списках, таблицах, схеме и поиске. */
export function TypeToken({ kind, children, className, title, required }: { kind: ObjectKind; children: ReactNode; className?: string; title?: string; required?: boolean }) {
  return (
    <span
      title={required ? (title ?? 'Обязательная сущность') : title}
      className={cn('inline-flex max-w-full items-center rounded-[5px] px-2 py-0.5 font-mono text-xs font-medium', TONE[kind], required && 'bg-destructive-bg text-destructive', className)}
    >
      <span className="truncate">{children}</span>
      {required && <span aria-hidden className="ml-0.5 self-start text-[1.1em] leading-none">*</span>}
    </span>
  );
}

/** Маленький цветной квадрат типа объекта для меню и списков. */
export function KindDot({ kind, className }: { kind: ObjectKind; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-[2px]', DOT[kind], className)} />;
}
