import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ResizableColumns } from '@/components/ResizableColumns';
import { SortHeader, useColumnSort } from '@/components/ColumnSort';
import { EditableDictionaryValue } from '@/components/EditableDictionaryValue';
import { DictCard } from '@/components/DictionaryMaster';
import { cn, GHOST } from '@/lib/utils';
import { parseBulkValues, splitTags } from '@/lib/parse';
import type { EntityValue } from '@/lib/types';

/** Синонимы и ввод нового тега внутри одного поля. */
function Synonyms({ value, label, onChange }: { value: string[]; label: string; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = () => {
    const add = splitTags(text);
    if (add.length) onChange([...value, ...add]);
    setText('');
  };
  return (
    <div
      className="flex min-h-10 min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-md px-2 py-1 transition-colors bg-card hover:bg-card focus-within:bg-card focus-within:ring-2 focus-within:ring-ring md:min-h-9"
      onClick={(e) => {
        if (e.target === e.currentTarget) inputRef.current?.focus();
      }}
    >
      {value.map((s, i) => (
        <span key={`${s}-${i}`} className="inline-flex min-h-7 max-w-full items-center gap-0.5 rounded-md bg-secondary pl-2.5 pr-0.5 text-[13px] text-secondary-foreground">
          <EditableDictionaryValue value={s} values={value} className="text-[13px]"
            onChange={(next) => onChange(value.map((item, j) => j === i ? next : item))} />
          <button
            type="button"
            aria-label={`Удалить синоним ${s}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        spellCheck={false}
        aria-label={`Новый синоним для ${label}`}
        className="h-8 min-w-0 flex-[1_1_1ch] bg-transparent px-0.5 text-sm outline-none placeholder:text-muted-foreground md:h-7"
        value={text}
        onChange={(e) => {
          if (e.target.value.includes(',')) {
            const add = splitTags(e.target.value);
            if (add.length) onChange([...value, ...add]);
            setText('');
          } else setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
      />
    </div>
  );
}

/** Таблица значений сущности: синонимы редактируются прямо в ячейке. */
export function EntityValues({ values, onChange }: { values: EntityValue[]; onChange: (v: EntityValue[]) => void }) {
  const sort = useColumnSort();
  const [bulk, setBulk] = useState<string | null>(null);
  const [draft, setDraft] = useState<EntityValue | null>(null);
  const draftRef = useRef(draft);
  const input = useRef<HTMLInputElement>(null);
  const updateDraft = (next: EntityValue | null) => { draftRef.current = next; setDraft(next); };
  const commit = () => {
    const next = draftRef.current;
    if (next?.value.trim()) onChange([{ ...next, value: next.value.trim() }, ...values]);
    updateDraft(null);
  };
  const add = () => {
    const next = draftRef.current;
    if (next?.value.trim()) onChange([{ ...next, value: next.value.trim() }, ...values]);
    updateDraft({ value: '', synonyms: [] });
    input.current?.focus();
  };
  const sorted = sort.rows(values.map((v, index) => ({ v, index })), (row, col) => col === 'value' ? row.v.value : row.v.synonyms.join(', '));
  const rows = draft ? [{ v: draft, index: -1 }, ...sorted] : sorted;
  const patchValue = (i: number, patch: Partial<EntityValue>) => {
    if (i === -1) updateDraft({ ...draftRef.current!, ...patch });
    else onChange(values.map((v, j) => j === i ? { ...v, ...patch } : v));
  };

  return (
    <DictCard
      title="Значения"
      action={
        <>
          <Button size="action" variant="outline" onClick={() => setBulk('')}>
            Вставить списком
          </Button>
          <Button size="action" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={add}>
            <Plus className="size-3.5" /> Значение
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Значений пока нет. Добавьте первое или вставьте список: одна строка — одно значение.</p>
      ) : (
        <ResizableColumns storageKey="dictionary-entity-values" columns={['value', 'synonyms']}
          initial="minmax(0,1fr) minmax(0,2fr) 32px" trailing="32px" className="overflow-hidden rounded-xl border bg-card">
          <div role="table" aria-label="Значения сущности">
            <div role="row" className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_32px] items-center gap-x-3 px-4 py-1 text-xs font-medium text-muted-foreground md:[grid-template-columns:var(--resizable-columns)]">
              <SortHeader column="value" sort={sort}>Значение</SortHeader>
              <SortHeader column="synonyms" sort={sort}>Синонимы</SortHeader><span role="columnheader" aria-label="Действия" />
            </div>
            <div role="rowgroup" className="divide-y divide-border border-t">
            {rows.map(({ v, index: i }) => (
              <div role="row" key={i === -1 ? 'draft' : i} className="group grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_32px] items-start gap-x-3 px-4 py-2.5 md:[grid-template-columns:var(--resizable-columns)]"
                onBlur={draft && i === -1 ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) commit(); } : undefined}>
                <div role="cell" className="min-w-0">
                <Input
                  className={cn(GHOST, 'h-10 px-2 font-mono text-[15px] font-medium md:h-9')}
                  value={v.value}
                  ref={draft && i === -1 ? input : undefined}
                  autoFocus={!!draft && i === -1}
                  onKeyDown={draft && i === -1 ? (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    if (e.key === 'Escape') { e.preventDefault(); updateDraft(null); }
                  } : undefined}
                  onChange={(e) => patchValue(i, { value: e.target.value })}
                  aria-label={draft && i === -1 ? 'Новое значение сущности' : `Значение ${i + 1}`}
                />
                </div>
                <div role="cell" className="min-w-0">
                  <Synonyms value={v.synonyms} label={v.value || `значения ${i + 1}`} onChange={(synonyms) => patchValue(i, { synonyms })} />
                </div>
                <div role="cell" className="min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 md:size-9"
                  aria-label={`Удалить значение ${v.value || i + 1}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => draft && i === -1 ? updateDraft(null) : onChange(values.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
                </div>
              </div>
            ))}
            </div>
          </div>
        </ResizableColumns>
      )}

      <Dialog open={bulk !== null} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Вставить значения списком</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Одна строка — одно значение: <code className="font-mono text-[13px]">значение: синоним1, синоним2</code>
          </p>
          <Textarea rows={8} className="font-mono text-[13px]" value={bulk ?? ''} onChange={(e) => setBulk(e.target.value)} />
          <DialogFooter>
            <Button
              onClick={() => {
                onChange([...parseBulkValues(bulk ?? ''), ...values]);
                setBulk(null);
              }}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DictCard>
  );
}
