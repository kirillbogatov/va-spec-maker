import { useId, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConditionOp, Dependency, EntityListItem, StepCondition } from '@/lib/types';
import { cn } from '@/lib/utils';
import { depLabel, valueSpec, validValue } from './dependencies';

interface Props {
  conditions: StepCondition[];
  freeText: string;
  mode?: 'all' | 'any';
  dependencies: Dependency[];
  entities: EntityListItem[];
  onChange: (p: { conditions?: StepCondition[]; condition?: string; cond_mode?: 'all' | 'any' }) => void;
  /** Узкий контейнер (боковая панель): субъект на своей строке, оператор и значение под ним. */
  stacked?: boolean;
}

const ALL_OPS: ConditionOp[] = ['=', '!=', '<', '>'];
const LIST_OPS: ConditionOp[] = ['=', '!='];

const subjectKey = (c: StepCondition) => (c.entity_id !== undefined ? `ent:${c.entity_id}` : `dep:${c.dep}`);
const fromKey = (key: string): Pick<StepCondition, 'dep' | 'entity_id'> =>
  key.startsWith('ent:') ? { dep: '', entity_id: Number(key.slice(4)) } : { dep: key.slice(4) };

/** Ячейка Condition: пары «зависимость или сущность — значение» (все должны выполняться) и произвольный текст. */
export function ConditionsCell({ conditions, freeText, mode = 'all', dependencies, entities, onChange, stacked }: Props) {
  const [showText, setShowText] = useState(false);
  /** В узкой панели условие редактируется в окне: индекс открытого условия. */
  const [editing, setEditing] = useState<number | null>(null);
  let editor: ReactNode = null;
  const modeName = useId();
  // Свои условия хранятся одной строкой: каждое условие — отдельная строка текста.
  const texts = freeText === '' ? (showText ? [''] : []) : freeText.split('\n');
  const setTexts = (next: string[]) => onChange({ condition: next.join('\n') });
  const depItems = dependencies.map((d) => ({ value: `dep:${d.ref}`, label: depLabel(d, entities) }));
  const entityItems = entities.map((e) => ({ value: `ent:${e.id}`, label: e.name }));
  const patch = (i: number, p: Partial<StepCondition>) =>
    onChange({ conditions: conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  const ctl = stacked ? 'py-0' : 'h-7 py-0 text-xs md:text-xs';
  return (
    <div className="space-y-2">
      {conditions.map((c, i) => {
        const { choices, input, ordered } = valueSpec(c, dependencies, entities);
        // Сравнения «<» и «>» осмысленны только для чисел, времени и дат.
        const opItems = (ordered ? ALL_OPS : LIST_OPS).map((o) => ({ value: o, label: o }));
        const valueItems = (choices ?? []).map((v) => ({ value: v, label: v }));
        const subjectItems = c.entity_id !== undefined ? entityItems : depItems;
        const remove = (
          <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Удалить условие ${i + 1}`} onClick={() => onChange({ conditions: conditions.filter((_, j) => j !== i) })}>
            <X className="size-3.5" />
          </Button>
        );
        const subject = (
          <Select items={subjectItems} value={subjectKey(c)} onValueChange={(v) => v && onChange({ conditions: conditions.map((x, j) => (j === i ? { ...fromKey(v), op: '=', value: '' } : x)) })}>
            <SelectTrigger className={cn(ctl, 'w-full min-w-0 [&_[data-slot=select-value]]:block! [&_[data-slot=select-value]]:truncate')} aria-label={c.entity_id !== undefined ? 'Сущность' : 'Зависимость'}><SelectValue /></SelectTrigger>
            <SelectContent>
              {subjectItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
        const op = (
          <Select items={opItems} value={ordered || c.op !== '<' && c.op !== '>' ? (c.op ?? '=') : '='} onValueChange={(v) => v && patch(i, { op: v as ConditionOp })}>
            <SelectTrigger className={cn(ctl, 'w-14 shrink-0 px-2')} aria-label="Оператор"><SelectValue /></SelectTrigger>
            <SelectContent>
              {opItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
        const value = choices ? (
          <Select items={valueItems} value={c.value} onValueChange={(v) => patch(i, { value: v ?? '' })}>
            <SelectTrigger className={cn(ctl, 'w-full min-w-0')} aria-label="Значение"><SelectValue placeholder="Значение" /></SelectTrigger>
            <SelectContent>
              {valueItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input className={cn(ctl, 'min-w-0 flex-1 px-2')} type={input} step={input === 'number' ? 'any' : undefined} value={c.value} aria-invalid={!validValue(input, c.value) || undefined}
            onChange={(e) => patch(i, { value: e.target.value })} aria-label="Значение" placeholder={input === 'text' ? 'Значение' : undefined} />
        );
        if (stacked) {
          if (editing === i) editor = (
            <div className="space-y-3">
              <div><span className="mb-1.5 block text-sm font-medium">{c.entity_id !== undefined ? 'Сущность' : 'Зависимость'}</span>{subject}</div>
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                <div><span className="mb-1.5 block text-sm font-medium">Оператор</span>{op}</div>
                <div><span className="mb-1.5 block text-sm font-medium">Значение</span>{value}</div>
              </div>
            </div>
          );
          const name = subjectItems.find((o) => o.value === subjectKey(c))?.label ?? '(не выбрано)';
          const bad = !c.value || !validValue(input, c.value);
          return (
            <div key={i} className="flex items-center gap-1">
              <button type="button" onClick={() => setEditing(i)} aria-label={`Изменить условие ${i + 1}`}
                className={cn('min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring', bad && 'border-destructive/60')}>
                {name} <span className="text-muted-foreground">{c.op ?? '='}</span> {c.value ? <span className="font-mono">{c.value}</span> : <span className="text-destructive">без значения</span>}
              </button>
              {remove}
            </div>
          );
        }
        return (
          <div key={i} className="flex items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-1 [&>*:not(:nth-child(2))]:min-w-0 [&>*:not(:nth-child(2))]:flex-1">{subject}{op}{value}</div>
            {remove}
          </div>
        );
      })}
      {texts.map((t, i) => (
        <div key={`t${i}`} className="flex items-center gap-1">
          <Input className={cn(ctl, 'min-w-0 flex-1 px-2')} placeholder="Своё условие (текст)" value={t} onChange={(e) => setTexts(texts.map((x, j) => (j === i ? e.target.value.replace(/\r?\n/g, ' ') : x)))} aria-label={`Своё условие ${i + 1}`} />
          <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Удалить своё условие ${i + 1}`} onClick={() => { setTexts(texts.filter((_, j) => j !== i)); if (texts.length === 1) setShowText(false); }}>
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="xs" disabled={entities.length === 0}
          onClick={() => { onChange({ conditions: [...conditions, { dep: '', entity_id: entities[0].id, op: '=', value: '' }] }); if (stacked) setEditing(conditions.length); }}>
          <Plus className="size-3" /> сущность
        </Button>
        <Button variant="outline" size="xs" disabled={dependencies.length === 0}
          onClick={() => { onChange({ conditions: [...conditions, { dep: dependencies[0].ref, op: '=', value: '' }] }); if (stacked) setEditing(conditions.length); }}>
          <Plus className="size-3" /> зависимость
        </Button>
        <Button variant="outline" size="xs" onClick={() => { setShowText(true); setTexts([...texts, '']); }}>
          <Plus className="size-3" /> своё
        </Button>
      </div>
      {conditions.length + texts.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1" role="radiogroup" aria-label="Как объединять условия">
          {([['all', 'Все условия'], ['any', 'Любое из условий']] as const).map(([m, label]) => (
            <label key={m} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="radio" name={modeName} className="size-3.5 accent-brand" checked={mode === m} onChange={() => onChange({ cond_mode: m })} />
              {label}
            </label>
          ))}
        </div>
      )}
      <Dialog open={editor !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Условие</DialogTitle></DialogHeader>
          {editor}
          <DialogFooter>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { if (editing !== null) onChange({ conditions: conditions.filter((_, j) => j !== editing) }); setEditing(null); }}>Удалить</Button>
            <Button onClick={() => setEditing(null)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
