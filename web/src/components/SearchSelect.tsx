import { OptionHint } from './OptionHint';
import { Fragment, type ReactNode } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import { SELECT_TRIGGER } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SearchOption { value: string; label: string; hint?: string }

interface Props {
  options: SearchOption[];
  /** null — ничего не выбрано (например, «подключить существующий»). */
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  className?: string;
  /** Содержимое кнопки; по умолчанию название выбранного или placeholder. */
  renderValue?: (o: SearchOption | null) => ReactNode;
  placeholder?: string;
  /** Приглушать подсказку обычного поля; для кнопок действий отключается. */
  mutedPlaceholder?: boolean;
  /** Значок слева в кнопке. */
  icon?: ReactNode;
  showChevron?: boolean;
  /** Первый пункт списка «+ …», он всегда виден при поиске и вызывает onCreate вместо onChange. */
  createLabel?: string;
  onCreate?: () => void;
}

const CREATE_VALUE = '\u0000create';

/** Выпадающий список с автофильтром по названию и описанию по мере ввода. */
export function SearchSelect({ options, value, onChange, label, className, renderValue, placeholder, mutedPlaceholder = true, icon, createLabel, onCreate, showChevron = true }: Props) {
  const selected = options.find((o) => o.value === value) ?? null;
  const items = createLabel && onCreate ? [{ value: CREATE_VALUE, label: `+ ${createLabel}` }, ...options] : options;
  return (
    <Combobox.Root
      items={items}
      value={selected}
      onValueChange={(o: SearchOption | null) => (o?.value === CREATE_VALUE ? onCreate?.() : onChange(o?.value ?? null))}
      itemToStringLabel={(o: SearchOption) => o.label}
      isItemEqualToValue={(a: SearchOption, b: SearchOption) => a.value === b.value}
      filter={(o: SearchOption, q: string) => o.value === CREATE_VALUE || `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())}
    >
      <Combobox.Trigger data-slot="select-trigger" className={cn(SELECT_TRIGGER, 'data-[size=default]:min-h-8', !mutedPlaceholder && 'data-placeholder:text-foreground', className)} data-size="default" aria-label={label}>
        {icon}
        <span className={cn('flex min-w-0 flex-1 text-left', !selected && placeholder && mutedPlaceholder && 'text-muted-foreground')}>
          {renderValue ? renderValue(selected) : selected?.label ?? placeholder}
        </span>
        {showChevron && <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50">
          <Combobox.Popup className="flex max-h-(--available-height) w-max min-w-(--anchor-width) max-w-[min(36rem,95vw)] origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-border dark:ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-center gap-2 border-b px-2.5">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <Combobox.Input placeholder="Поиск…" aria-label="Поиск" className="h-9 w-full min-w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">Ничего не найдено</Combobox.Empty>
            <Combobox.List className="max-h-72 overflow-y-auto p-1">
              {(o: SearchOption) => (
                <Fragment key={o.value}>
                <Combobox.Item
                  key={o.value}
                  value={o}
                  className={cn(
                    'relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground',
                    o.value === CREATE_VALUE && 'text-brand',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words">{o.label}</span>
                    <OptionHint text={o.hint} />
                  </span>
                  <Combobox.ItemIndicator render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}>
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
                {o.value === CREATE_VALUE && options.length > 0 && <Combobox.Separator data-slot="create-option-separator" className="my-1 h-px bg-border" />}
                </Fragment>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
