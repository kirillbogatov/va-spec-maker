import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FieldLabel } from '@/components/Section';
import { cn, GHOST } from '@/lib/utils';
import { splitNext, type StepIssue } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Step } from '@/lib/types';
import { ConditionsCell } from '../ConditionsCell';
import { IntentSelect } from '../StepsTable';

interface Props {
  step: Step;
  states: string[];
  intents: IntentListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  issues: StepIssue[];
  onSelectState: (name: string) => void;
  onPatch: (p: Partial<Step>) => void;
  onRemove: () => void;
  onClose: () => void;
}

function StateSelect({ value, states, label, onChange }: { value: string; states: string[]; label: string; onChange: (v: string) => void }) {
  const items = [...(value && !states.includes(value) ? [value] : []), ...states].map((s) => ({ value: s, label: s }));
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={cn(GHOST, 'w-full font-mono text-[13px]')} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Редактор одного ребра = одной строки Transition table. */
export function EdgePanel({ step, states, intents, dependencies, entities, issues, onPatch, onRemove, onClose, onSelectState }: Props) {
  const errors = issues.filter((i) => i.level === 'error');
  const target = splitNext(step.next_states)[0] ?? '';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Переход</h3>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Удалить переход" onClick={onRemove}><Trash2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Закрыть панель" onClick={onClose}><X className="size-4" /></Button>
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="space-y-1 text-xs">
          {errors.map((i, n) => (
            <li key={n} className="flex items-start gap-1.5 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {i.text}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-4">
        <div>
          <FieldLabel>Из состояния</FieldLabel>
          <StateSelect value={step.state} states={states} label="Исходное состояние" onChange={(state) => onPatch({ state })} />
        </div>
        <div>
          <FieldLabel>В состояние</FieldLabel>
          <StateSelect value={target} states={states} label="Следующее состояние" onChange={(next_states) => onPatch({ next_states })} />
        </div>
      </div>
      <div>
        <FieldLabel>Интент</FieldLabel>
        <IntentSelect intents={intents} step={step} onPatch={onPatch} label="Интент" />
      </div>
      <div>
        <FieldLabel>Условия</FieldLabel>
        <ConditionsCell conditions={step.conditions} freeText={step.condition} dependencies={dependencies} entities={entities} onChange={onPatch} />
      </div>
      <div>
        <FieldLabel>Пример запроса (необязательно)</FieldLabel>
        <Textarea rows={1} className={cn(GHOST, 'field-sizing-content min-h-9')} value={step.request_params} onChange={(e) => onPatch({ request_params: e.target.value })} aria-label="Пример запроса" />
      </div>
      {target && (
        <p className="text-xs text-muted-foreground">
          Ответ ассистента и действие системы задаются в состоянии{' '}
          <button type="button" className="font-mono text-brand hover:underline" onClick={() => onSelectState(target)}>{target}</button>.
        </p>
      )}
    </div>
  );
}
