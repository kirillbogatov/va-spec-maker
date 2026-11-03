import { SearchSelect, type SearchOption } from '@/components/SearchSelect';
import { cn, GHOST } from '@/lib/utils';
import type { IntentListItem } from '@/lib/types';

const idOf = (v: string | null) => (v == null || v === 'none' ? null : Number(v));

const oneLine = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ');

export const DialogLabel =({ children }: { children: string }) => <span className="mb-1.5 block text-sm font-medium text-foreground">{children}</span>;

export function OptionSelect({ options, value, onChange, label, hideValueHint, className }: { options: SearchOption[]; value: number | null; onChange: (v: number | null) => void; label: string; /** Не показывать описание в выбранном значении (узкие панели). */ hideValueHint?: boolean; /** Заменяет «призрачный» стиль поля. */ className?: string }) {
  return (
    <SearchSelect
      options={options}
      value={value === null ? 'none' : String(value)}
      onChange={(v) => onChange(idOf(v))}
      label={label}
      className={cn(className ?? GHOST, 'w-full')}
      renderValue={(o) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0">{o?.label}</span>
          {!hideValueHint && oneLine(o?.hint) && <span className="min-w-0 truncate text-xs text-muted-foreground">{oneLine(o?.hint)}</span>}
        </span>
      )}
    />
  );
}

/** Явный wildcard сохраняется отдельно от незаполненного интента. */
export function IntentSelect({ intents, value, anyIntent = false, onChange, label, emptyLabel = '— не выбран —', hideValueHint, fieldClassName }: {
  intents: IntentListItem[]; value: number | null; anyIntent?: boolean; onChange: (v: number | null, anyIntent: boolean) => void; label: string; emptyLabel?: string; hideValueHint?: boolean; fieldClassName?: string;
}) {
  const options = [
    { value: 'none', label: emptyLabel },
    { value: 'any', label: 'Любой интент', hint: 'Any intent' },
    ...intents.map((i) => ({ value: String(i.id), label: i.name, hint: i.hint })),
  ];
  return <SearchSelect
    options={options}
    value={anyIntent ? 'any' : value === null ? 'none' : String(value)}
    onChange={(v) => onChange(v === 'any' ? null : idOf(v), v === 'any')}
    label={label}
    className={cn(fieldClassName ?? GHOST, 'w-full')}
    renderValue={(o) => (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0">{o?.label}</span>
        {!hideValueHint && o?.value !== 'any' && oneLine(o?.hint) && <span className="min-w-0 truncate text-xs text-muted-foreground">{oneLine(o?.hint)}</span>}
      </span>
    )}
  />;
}
