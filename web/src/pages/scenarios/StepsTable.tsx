import { useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, GripVertical, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/SearchSelect';
import { Textarea } from '@/components/ui/textarea';
import { TypeToken } from '@/components/TypeToken';
import { cn, FIELD, GHOST } from '@/lib/utils';
import type { Dependency, EntityListItem, Layout, IntentListItem, PromptListItem, Step, StepCondition } from '@/lib/types';
import { splitNext, type StepIssue } from '@/lib/states';
import { ConditionsCell } from './ConditionsCell';
import { depLabel } from './dependencies';

/** Поле следующего состояния с подсказками под ним: клик по состоянию подставляет его вместо введённого. */
function NextStateCell({ value, states, label, onChange, className }: { value: string; states: string[]; label: string; onChange: (v: string) => void; className?: string }) {
  const [focused, setFocused] = useState(false);
  const q = value.trim().toLowerCase();
  const hints = states.filter((s) => s !== value.trim() && s.toLowerCase().includes(q)).slice(0, 8);
  return (
    <div>
      <Input className={cn(className ?? GHOST, 'bg-background')} value={value} aria-label={label} placeholder="ST_…" autoComplete="off"
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} />
      {focused && hints.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {hints.map((h) => (
            <button key={h} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(h)}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-brand hover:text-white">{h}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** hint — краткое описание: вторая строка в списке и серый хвост в выбранном значении. */
export interface Option { value: string; label: string; hint?: string }

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dependencies: Dependency[];
  entities: EntityListItem[];
  allStates: string[];
  issues: StepIssue[];
  onPatch: (p: Partial<Step>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onInsertBelow: () => void;
}

const idOf = (v: string | null) => (v == null || v === 'none' ? null : Number(v));

const oneLine = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ');

export const DialogLabel =({ children }: { children: string }) => <span className="mb-1.5 block text-sm font-medium text-foreground">{children}</span>;

export function OptionSelect({ options, value, onChange, label, hideValueHint, className }: { options: Option[]; value: number | null; onChange: (v: number | null) => void; label: string; /** Не показывать описание в выбранном значении (узкие панели). */ hideValueHint?: boolean; /** Заменяет «призрачный» стиль поля. */ className?: string }) {
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

/** Выбор интента строки; пустое значение подписывается по-разному: у ошибок это «любой интент». */
export function IntentSelect({ intents, value, onChange, label, emptyLabel = '— не выбран —', hideValueHint, fieldClassName }: {
  intents: IntentListItem[]; value: number | null; onChange: (v: number | null) => void; label: string; emptyLabel?: string; hideValueHint?: boolean; fieldClassName?: string;
}) {
  const options = [{ value: 'none', label: emptyLabel }, ...intents.map((i) => ({ value: String(i.id), label: i.name, hint: i.hint }))];
  return <OptionSelect options={options} value={value} onChange={onChange} label={label} hideValueHint={hideValueHint} className={fieldClassName} />;
}

/** Сетка правила: справа действия и перенос; на мобильном правило — карточка. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 md:grid-cols-[160px_190px_170px_minmax(0,1fr)_minmax(0,1.2fr)_72px]';

/** Условие в сжатой записи: «Режим дома = away». */
function chipText(c: StepCondition, deps: Dependency[], entities: EntityListItem[]): string {
  const name = c.entity_id !== undefined
    ? entities.find((e) => e.id === c.entity_id)?.name ?? `сущность #${c.entity_id}`
    : (() => { const d = deps.find((x) => x.ref === c.dep); return d ? depLabel(d, entities) : c.dep; })();
  return `${name} ${c.op ?? '='} ${c.value}`;
}

const MobileLabel = ({ children }: { children: string }) => <span className="mb-0.5 block text-xs text-faint md:hidden">{children}</span>;

function StepRow({ step, index, intents, promptOptions, open, onOpenChange, dependencies, entities, allStates, issues, onPatch, onRemove, onDuplicate, onInsertBelow }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.key! });
  const intent = intents.find((i) => i.id === step.intent_id)?.name;
  const isGlobal = step.kind === 'global';
  const prompt = step.prompt_id === null ? undefined : promptOptions.find((o) => o.value === String(step.prompt_id))?.label;
  const chips = [...step.conditions.map((c) => chipText(c, dependencies, entities)), ...step.condition.split('\n').map((l) => l.trim()).filter(Boolean)];
  const next = splitNext(step.next_states);
  const btn = 'max-md:size-10';
  return (
    <>
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('border-b bg-card last:border-b-0', isDragging && 'relative z-10 shadow-md')}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onInsertBelow(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); onDuplicate(); }
      }}>
      <div className={cn(GRID, 'min-h-14 cursor-pointer py-2.5')} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onOpenChange(true); }}>
        <div className="grid min-w-0 gap-2 md:contents">
          <div className="min-w-0 text-sm">
            <MobileLabel>Название</MobileLabel>
            {step.name?.trim() ? <span className="font-medium [overflow-wrap:anywhere]">{step.name}</span> : <span className="italic text-muted-foreground">без названия</span>}
          </div>
          <div className="min-w-0">
            <MobileLabel>Состояние</MobileLabel>
            {isGlobal
              ? <span className="text-sm text-muted-foreground">Любое состояние</span>
              : step.state.trim()
                ? <span className="inline-block max-w-full break-all rounded-[5px] bg-st-bg px-2 py-0.5 font-mono text-xs font-medium text-st">{step.state}</span>
                : <span className="text-sm italic text-muted-foreground">без состояния</span>}
          </div>
          <div className="min-w-0 text-sm">
            <MobileLabel>Интент</MobileLabel>
            {intent ? <TypeToken kind="intent" title={intent}>{intent}</TypeToken> : <span className="text-muted-foreground">{step.kind === 'error' ? 'любой' : 'не выбран'}</span>}
          </div>
          <div className="min-w-0 text-sm">
            <MobileLabel>Если</MobileLabel>
            {chips.length === 0 ? <span className="text-muted-foreground">всегда</span> : (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                {chips.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="text-xs text-muted-foreground">и</span>}
                    <span className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-xs [overflow-wrap:anywhere]">{c}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 text-sm">
            <MobileLabel>То</MobileLabel>
            {prompt || next.length > 0 || step.system_action.trim() ? (
              <div>
                {prompt && <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">Ответить <TypeToken kind="prompt" title={prompt}>{prompt}</TypeToken></span>}
                {step.system_action.trim() && <div className="line-clamp-2 text-muted-foreground">{step.system_action}</div>}
                {next.length > 0 && <div className="font-mono text-xs text-muted-foreground">→ {next.join(', ')}</div>}
              </div>
            ) : <span className="text-muted-foreground">ничего не задано</span>}
          </div>
        </div>
        <div className="flex items-center max-md:flex-col">
          <Button variant="ghost" size="icon" className={btn} aria-label={`Удалить строку ${index + 1}`} onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
          <button type="button" aria-label={`Перетащить строку ${index + 1}`} className={cn('inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring', btn)} {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
        </div>
        {issues.length > 0 && (
          <ul className="col-span-full flex flex-col gap-0.5 text-xs md:col-span-5 md:col-start-1">
            {issues.map((i, n) => (
              <li key={n} className={cn('flex items-start gap-1.5', i.level === 'error' ? 'text-destructive' : 'text-warning')}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span><span className="font-medium">{i.level === 'error' ? 'Ошибка: ' : 'Предупреждение: '}</span>{i.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] flex flex-col gap-0 overflow-hidden p-5 sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
            onOpenChange(false);
          }
        }}
      >
        <DialogHeader className="shrink-0 pb-4 pr-8">
          <DialogTitle>{isGlobal ? 'Глобальный переход' : 'Правило'} {index + 1}</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1">
          <div>
            <DialogLabel>Название</DialogLabel>
            <Input className={FIELD} value={step.name ?? ''} onChange={(e) => onPatch({ name: e.target.value })} aria-label={`Название, строка ${index + 1}`} placeholder="Например, «Не расслышали»" />
          </div>
          <section className="space-y-3.5 rounded-lg border bg-muted/30 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand">Если</h3>
            <div className={isGlobal ? 'hidden' : undefined}>
              <DialogLabel>Состояние</DialogLabel>
              <Input className={cn(FIELD, 'font-mono text-[13px]')} list="scenario-states" value={step.state} onFocus={(e) => { if (!step.state.trim()) { onPatch({ state: 'ST_' }); const el = e.currentTarget; requestAnimationFrame(() => el.setSelectionRange(3, 3)); } }} onChange={(e) => onPatch({ state: e.target.value })} aria-label={`Состояние, строка ${index + 1}`} placeholder="ST_…" />
            </div>
            <div>
              <DialogLabel>Интент</DialogLabel>
              <IntentSelect intents={intents} value={step.intent_id} emptyLabel={step.kind === 'error' ? 'Любой интент' : '— не выбран —'} onChange={(intent_id) => onPatch({ intent_id })} label={`Интент, строка ${index + 1}`} fieldClassName={FIELD} />
            </div>
            <div>
              <DialogLabel>Условия</DialogLabel>
              <ConditionsCell conditions={step.conditions} freeText={step.condition} mode={step.cond_mode} dependencies={dependencies} entities={entities} onChange={onPatch} stacked />
            </div>
          </section>
          <section className="space-y-3.5 rounded-lg border bg-muted/30 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand">То</h3>
            <div className={isGlobal ? 'hidden' : undefined}>
              <DialogLabel>Ответ ассистента</DialogLabel>
              <OptionSelect options={promptOptions} value={step.prompt_id} onChange={(prompt_id) => onPatch({ prompt_id })} label={`Ответ ассистента, строка ${index + 1}`} className={FIELD} />
            </div>
            <div className={isGlobal ? 'hidden' : undefined}>
              <DialogLabel>Действие системы</DialogLabel>
              <Textarea rows={1} className={cn(FIELD, 'field-sizing-content min-h-9')} value={step.system_action} onChange={(e) => onPatch({ system_action: e.target.value })} aria-label={`Действие системы, строка ${index + 1}`} placeholder="Не задано" />
            </div>
            <div>
              <DialogLabel>Следующее состояние</DialogLabel>
              <NextStateCell value={step.next_states} states={allStates} label={`Следующее состояние, строка ${index + 1}`} onChange={(next_states) => onPatch({ next_states })} className={cn(FIELD, 'font-mono text-[13px]')} />
            </div>
          </section>
        </div>
        <DialogFooter className="shrink-0 -mx-5 -mb-5 mt-4 px-5 sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { onOpenChange(false); onRemove(); }}>
              <Trash2 className="size-4" /> Удалить
            </Button>
            <Button onClick={() => onOpenChange(false)}>Готово</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export function StepsTable({ kind, title, steps, intents, prompts, dependencies, entities, allStates, issues, onChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const promptOptions = [{ value: 'none', label: '— не выбран —' }, ...prompts.map((p) => ({ value: String(p.id), label: p.name, hint: p.hint }))];
  const [editKey, setEditKey] = useState<string | null>(null);
  const expand = (s: Step) => setEditKey(s.key!);

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
    key: crypto.randomUUID(), name: '', kind, state, intent_id: null, request_params: '',
    condition: '', conditions: [], prompt_id: null, system_action: '', next_states: '',
  });
  const add = () => { const s = blank(steps.at(-1)?.state ?? ''); onChange([...steps, s]); expand(s); };
  const insertBelow = (i: number) => { const s = blank(steps[i].state); onChange([...steps.slice(0, i + 1), s, ...steps.slice(i + 1)]); expand(s); };
  const duplicate = (i: number) =>
    onChange([...steps.slice(0, i + 1), { ...steps[i], key: crypto.randomUUID(), conditions: steps[i].conditions.map((c) => ({ ...c })) }, ...steps.slice(i + 1)]);

  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="outline" className="max-md:h-10" onClick={add}><Plus className="size-4" /> Правило</Button>
        <p className="text-sm text-muted-foreground">
          {kind === 'global' ? 'Проверяются сверху вниз; срабатывает первый подошедший переход.' : 'Правила проверяются сверху вниз, срабатывает первое подошедшее.'}
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className={cn(GRID, 'hidden border-b py-2 text-xs font-medium text-muted-foreground md:grid')}>
          <span>Название</span><span>Состояние</span><span>Интент</span><span>Если</span><span>То</span><span className="sr-only">Действия и перенос</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={steps.map((s) => s.key!)} strategy={verticalListSortingStrategy}>
            <datalist id="scenario-states">{allStates.map((s) => <option key={s} value={s} />)}</datalist>
            {steps.map((s, i) => (
              <StepRow
                key={s.key}
                step={s}
                index={i}
                intents={intents}
                promptOptions={promptOptions}
                open={editKey === s.key}
                onOpenChange={(o) => setEditKey(o ? s.key! : null)}
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
          </SortableContext>
        </DndContext>
        {steps.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">{kind === 'global' ? 'Глобальных переходов пока нет.' : 'Правил пока нет: при ошибке ассистент не знает, что ответить.'}</p>
            <Button onClick={add}><Plus className="size-4" /> Правило</Button>
          </div>
        )}
      </div>
    </section>
  );
}
