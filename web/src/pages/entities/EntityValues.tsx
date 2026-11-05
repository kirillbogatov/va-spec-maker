import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
      className="flex min-h-10 min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 transition-colors hover:border-ring focus-within:border-ring focus-within:ring-2 focus-within:ring-ring md:min-h-9"
      onClick={(e) => {
        if (e.target === e.currentTarget) inputRef.current?.focus();
      }}
    >
      {value.map((s, i) => (
        <span key={`${s}-${i}`} className="inline-flex min-h-7 max-w-full items-center gap-0.5 rounded-md bg-secondary pl-2.5 pr-0.5 text-[13px] text-secondary-foreground">
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{s}</span>
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

/** Значения сущности с синонимами: каноническое значение крупно, синонимы чипами рядом. */
export function EntityValues({ values, onChange }: { values: EntityValue[]; onChange: (v: EntityValue[]) => void }) {
  const [bulk, setBulk] = useState<string | null>(null);
  const patchValue = (i: number, p: Partial<EntityValue>) => onChange(values.map((v, j) => (j === i ? { ...v, ...p } : v)));

  return (
    <DictCard
      title="Значения"
      action={
        <>
          <Button size="action" variant="outline" onClick={() => setBulk('')}>
            Вставить списком
          </Button>
          <Button size="action"  onClick={() => onChange([...values, { value: '', synonyms: [] }])}>
            <Plus className="size-3.5" /> Значение
          </Button>
        </>
      }
    >
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">Значений пока нет. Добавьте первое или вставьте список: одна строка — одно значение.</p>
      ) : (
        <>
          <ul className="-my-1 divide-y divide-border">
            {values.map((v, i) => (
              <li key={i} className="group grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-1 py-2 md:grid-cols-[200px_1fr_auto]">
                <Input
                  className={cn(GHOST, 'h-10 px-2 font-mono text-[15px] font-medium md:h-9')}
                  value={v.value}
                  autoFocus={v.value === '' && i === values.length - 1}
                  onChange={(e) => patchValue(i, { value: e.target.value })}
                  aria-label={`Значение ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 md:order-last md:size-9"
                  aria-label={`Удалить значение ${v.value || i + 1}`}
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <Synonyms value={v.synonyms} label={v.value || `значения ${i + 1}`} onChange={(synonyms) => patchValue(i, { synonyms })} />
                </div>
              </li>
            ))}
          </ul>
        </>
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
                onChange([...values, ...parseBulkValues(bulk ?? '')]);
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
