import { useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, GripVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Section, SectionAction } from '@/components/Section';
import { cn, GHOST } from '@/lib/utils';
import type { Dependency, EntityListItem, Layout, IntentListItem, PromptListItem, Step } from '@/lib/types';
import { splitNext, type StepIssue } from '@/lib/states';
import { ConditionsCell } from './ConditionsCell';

/** Подсказки состояний под полем: подставляют выбранное вместо последнего набираемого слова. */
function NextStatesCell({ value, states, label, onChange }: { value: string; states: string[]; label: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const last = value.match(/[^\s,;|]*$/)?.[0] ?? '';
  const used = new Set(splitNext(value));
  const hints = states.filter((s) => !used.has(s) && s.toLowerCase().includes(last.toLowerCase())).slice(0, 6);
  return (
    <div className="relative">
      <Textarea rows={1} className={cn(GHOST, 'field-sizing-content min-h-9')} value={value} aria-label={label}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} />
      {focused && hints.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-0.5 flex max-w-64 flex-wrap gap-1 rounded-md border bg-popover p-1.5 shadow-md">
          {hints.map((h) => (
            <button key={h} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(value.slice(0, value.length - last.length) + h)}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-brand hover:text-white">{h}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Option { value: string; label: string }

interface Props {
  kind: Step['kind'];
  title: string;
  steps: Step[];
  intents: IntentListItem[];
  prompts: PromptListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  /** Все состояния сценария (для подсказок) и замечания по строкам. */
  allStates: string[];
  issues: Map<string, StepIssue[]>;
  /** Для ошибок: код результата берётся из состояния строки (как в экспорте). */
  layout?: Layout;
  onChange: (steps: Step[]) => void;
}

interface RowProps {
  step: Step;
  index: number;
  intents: IntentListItem[];
  promptOptions: Option[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  allStates: string[];
  issues: StepIssue[];
  /** Задано только для ошибок: показывает колонку «Код результата». */
  onPatch: (p: Partial<Step>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onInsertBelow: () => void;
}

const idOf = (v: string | null) => (v == null || v === 'none' ? null : Number(v));

export function OptionSelect({ options, value, onChange, label }: { options: Option[]; value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <Select items={options} value={value === null ? 'none' : String(value)} onValueChange={(v) => onChange(idOf(v))}>
      <SelectTrigger className={cn(GHOST, 'w-full')} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Выбор интента перехода: интент сценария, «Любой интент сценария» или пусто. */
export function IntentSelect({ intents, step, onPatch, label }: { intents: IntentListItem[]; step: Step; onPatch: (p: Partial<Step>) => void; label: string }) {
  const options = [{ value: 'none', label: '— не выбран —' }, { value: 'any', label: 'Любой интент сценария' }, ...intents.map((i) => ({ value: String(i.id), label: i.name }))];
  return (
    <Select items={options} value={step.any_intent ? 'any' : step.intent_id === null ? 'none' : String(step.intent_id)}
      onValueChange={(v) => onPatch(v === 'any' ? { any_intent: true, intent_id: null } : { any_intent: false, intent_id: idOf(v) })}>
      <SelectTrigger className={cn(GHOST, 'w-full')} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StepRow({ step, index, intents, promptOptions, dependencies, entities, allStates, issues, onPatch, onRemove, onDuplicate, onInsertBelow }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.key! });
  return (
    <TableRow ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="group/row [&>td]:align-top"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onInsertBelow(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); onDuplicate(); }
      }}>
      <TableCell className="sticky left-0 z-[1] w-10 bg-card">
        <div className="flex h-9 items-center text-muted-foreground">
          <button type="button" aria-label={`Перетащить строку ${index + 1}`} className="cursor-grab rounded-sm p-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
        </div>
      </TableCell>
      <TableCell className="sticky left-10 z-[1] w-44 bg-card shadow-[1px_0_0_var(--border)]">
        <Input className={cn(GHOST, 'font-mono text-[13px]')} list="scenario-states" value={step.state} onFocus={(e) => { if (!step.state.trim()) { onPatch({ state: 'ST_' }); const el = e.currentTarget; requestAnimationFrame(() => el.setSelectionRange(3, 3)); } }} onChange={(e) => onPatch({ state: e.target.value })} aria-label={`Состояние, строка ${index + 1}`} placeholder="ST_…" />
      </TableCell>
      <TableCell className="w-56">
        <IntentSelect intents={intents} step={step} onPatch={onPatch} label={`Интент, строка ${index + 1}`} />
      </TableCell>
      <TableCell className="w-[26rem]">
        <ConditionsCell
          conditions={step.conditions}
          freeText={step.condition}
          dependencies={dependencies}
          entities={entities}
          onChange={onPatch}
        />
      </TableCell>
      <TableCell className="w-48">
        <Textarea rows={1} className={cn(GHOST, 'field-sizing-content min-h-9')} value={step.system_action} onChange={(e) => onPatch({ system_action: e.target.value })} aria-label={`Действие системы, строка ${index + 1}`} />
      </TableCell>
      <TableCell className="w-48">
        <NextStatesCell value={step.next_states} states={allStates} label={`Следующие состояния, строка ${index + 1}`} onChange={(next_states) => onPatch({ next_states })} />
      </TableCell>
      <TableCell className="w-44">
        <OptionSelect options={promptOptions} value={step.prompt_id} onChange={(prompt_id) => onPatch({ prompt_id })} label={`Ответ ассистента, строка ${index + 1}`} />
      </TableCell>
      <TableCell className="w-20">
        <div className="flex h-9 items-center">
          {issues.length > 0 && (
            <span title={issues.map((i) => i.text).join('\n')} className={cn('inline-flex size-8 items-center justify-center', issues.some((i) => i.level === 'error') ? 'text-destructive' : 'text-amber-500')}>
              <AlertTriangle className="size-4" aria-label={issues.map((i) => i.text).join('; ')} />
            </span>
          )}
          <Button variant="ghost" size="icon" aria-label={`Удалить строку ${index + 1}`} onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function StepsTable({ kind, title, steps, intents, prompts, dependencies, entities, allStates, issues, onChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const promptOptions = [{ value: 'none', label: '— не выбран —' }, ...prompts.map((p) => ({ value: String(p.id), label: p.name }))];

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = steps.findIndex((s) => s.key === active.id);
    const to = steps.findIndex((s) => s.key === over.id);
    onChange(arrayMove(steps, from, to));
  };
  const patch = (i: number, p: Partial<Step>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const remove = (i: number) => {
    const removed = steps[i];
    onChange(steps.filter((_, j) => j !== i));
    toast(`Строка ${i + 1} удалена`, {
      action: { label: 'Отменить', onClick: () => onChange([...steps.slice(0, i), removed, ...steps.slice(i)]) },
    });
  };
  const blank = (state: string): Step => ({
    key: crypto.randomUUID(), kind, state, intent_id: null, request_params: '',
    condition: '', conditions: [], prompt_id: null, system_action: '', next_states: '',
  });
  const add = () => onChange([...steps, blank(steps.at(-1)?.state ?? '')]);
  const insertBelow = (i: number) => onChange([...steps.slice(0, i + 1), blank(steps[i].state), ...steps.slice(i + 1)]);
  const duplicate = (i: number) =>
    onChange([...steps.slice(0, i + 1), { ...steps[i], key: crypto.randomUUID(), conditions: steps[i].conditions.map((c) => ({ ...c })) }, ...steps.slice(i + 1)]);

  return (
    <Section title={title} action={<SectionAction onClick={add}>Добавить строку</SectionAction>}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s.key!)} strategy={verticalListSortingStrategy}>
          <datalist id="scenario-states">{allStates.map((s) => <option key={s} value={s} />)}</datalist>
          <Table className="min-w-[1280px]" containerClassName="max-h-[70vh]">
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead className="sticky left-0 z-[2] w-10 bg-muted" />
                <TableHead className="sticky left-10 z-[2] bg-muted">Состояние</TableHead>
                <TableHead>Интент</TableHead>
                <TableHead>Условия</TableHead>
                <TableHead>Действие системы</TableHead>
                <TableHead>Следующие состояния</TableHead>
                <TableHead>Ответ ассистента</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {steps.map((s, i) => (
                <StepRow
                  key={s.key}
                  step={s}
                  index={i}
                  intents={intents}
                  promptOptions={promptOptions}
                  dependencies={dependencies}
                  entities={entities}
                  allStates={allStates}
                  issues={issues.get(s.key!) ?? []}
                  onPatch={(p) => patch(i, p)}
                  onRemove={() => remove(i)}
                  onDuplicate={() => duplicate(i)}
                  onInsertBelow={() => insertBelow(i)}
                />
              ))}
              {steps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    Строк пока нет.{' '}
                    <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={add}>Добавить первую</button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </SortableContext>
      </DndContext>
    </Section>
  );
}
