import { cn } from '@/lib/utils';
import type { ValueKind } from '@/lib/values';

const TITLE: Record<ValueKind, string> = { phrase: 'Тренировочная фраза', pattern: 'Паттерн' };

/** Значок типа значения интента: «Т» — тренировочная фраза, «@» — паттерн; по клику переключается. */
export function KindToggle({ kind, onChange, bare, className }: { kind: ValueKind; onChange: (k: ValueKind) => void; /** Без рамки: для значка внутри уже обведённого списка. */ bare?: boolean; className?: string }) {
  const next: ValueKind = kind === 'phrase' ? 'pattern' : 'phrase';
  return (
    <button
      type="button"
      title={`${TITLE[kind]} (нажмите, чтобы сменить на «${TITLE[next].toLowerCase()}»)`}
      aria-label={`Тип: ${TITLE[kind].toLowerCase()}`}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md border select-none font-mono text-xs font-bold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring max-md:size-10',
        bare ? 'border-transparent text-muted-foreground hover:text-foreground' : 'border-input text-muted-foreground',
        className,
      )}
      onClick={() => onChange(next)}
    >
      {kind === 'phrase' ? 'Т' : '@'}
    </button>
  );
}
