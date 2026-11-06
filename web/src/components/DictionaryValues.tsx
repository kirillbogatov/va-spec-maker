import { useRef, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { DictCard } from './DictionaryMaster';
import { Button } from './ui/button';
import { SortHeader, useColumnSort } from './ColumnSort';
import { EditableDictionaryValue } from './EditableDictionaryValue';
import { Input } from './ui/input';

/** Добавление сверху в общий список, как у вариантов ответа промпта. */
export function DictionaryValues({ title, label, empty, value, parse, onChange, renderValue, removeLabel }: {
  title: string;
  label: string;
  empty: string;
  value: string[];
  parse: (text: string) => string[];
  onChange: (value: string[]) => void;
  renderValue?: (value: string) => ReactNode;
  removeLabel: (value: string) => string;
}) {
  const sort = useColumnSort();
  const sorted = sort.rows(value.map((item, index) => ({ item, index })), (row) => row.item);
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const commit = () => {
    const items = parse(draft ?? '');
    if (items.length) onChange([...new Set([...items, ...value])]);
    setDraft(null);
  };
  const add = () => {
    const items = parse(draft ?? '');
    if (items.length) onChange([...new Set([...items, ...value])]);
    setDraft('');
    input.current?.focus();
  };
  return (
    <DictCard title={title} action={
      <Button size="action" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={add}>
        <Plus className="size-3.5" /> Добавить
      </Button>
    }>
      {value.length === 0 && draft === null ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-3 px-4 py-1 text-xs font-medium text-muted-foreground">
          <SortHeader column="value" sort={sort}>{title === 'Синонимы' ? 'Синоним' : 'Значение'}</SortHeader><span />
        </div>
        <ul className="divide-y divide-border border-t">
          {draft !== null && (
            <li className="flex min-w-0 items-center">
              <Input ref={input} autoFocus aria-label={label} value={draft}
                className="h-10 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 md:h-9 dark:bg-transparent"
                onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(); }
                  if (e.key === 'Escape') { e.preventDefault(); setDraft(null); }
                }}
              />
              <Button variant="ghost" size="icon" aria-label="Отменить добавление" className="mr-1 shrink-0"
                onMouseDown={(e) => e.preventDefault()} onClick={() => setDraft(null)}><X className="size-3.5" /></Button>
            </li>
          )}
          {sorted.map(({ item, index: i }) => (
            <li key={`${item}-${i}`} className="group flex min-h-10 items-center gap-2 px-3 py-1 md:min-h-9">
              {renderValue ? renderValue(item) : <EditableDictionaryValue value={item} values={value} onChange={(next) => onChange(value.map((v, j) => j === i ? next : v))} />}
              <Button variant="ghost" size="icon" aria-label={removeLabel(item)}
                className="size-8 shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onChange(value.filter((_, j) => j !== i))}><X className="size-3.5" /></Button>
            </li>
          ))}
        </ul>
        </div>
      )}
    </DictCard>
  );
}
