import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TypeToken } from '@/components/TypeToken';
import { cn, FIELD } from '@/lib/utils';
import { splitNext, type StepIssue } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Step } from '@/lib/types';
import { ConditionsCell } from '../ConditionsCell';
import { DialogLabel, IntentSelect } from '../StepsTable';
import { PanelHeader, PanelRoot, PanelSection } from './PanelParts';
import { planConditionStates } from './conditionStates';

interface Props {
  step: Step;
  steps: Step[];
  states: string[];
  /** Описания состояний по имени. */
  descriptions: Record<string, string>;
  intents: IntentListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  issues: StepIssue[];
  /** Название промпта состояния-цели (ответ системы при переходе). */
  targetPrompt?: string;
  onSelectState: (name: string) => void;
  onPatch: (p: Partial<Step>) => void;
  onCreateConditionStates: () => void;
  onRemove: () => void;
}

function StateSelect({ value, states, descriptions, label, onChange }: { value: string; states: string[]; descriptions: Record<string, string>; label: string; onChange: (v: string) => void }) {
  const items = [...(value && !states.includes(value) ? [value] : []), ...states].map((s) => ({ value: s, label: s }));
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={cn(FIELD, 'w-full font-mono text-[13px]')} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {descriptions[o.value] && <span className="max-w-64 truncate font-sans text-xs text-muted-foreground">{descriptions[o.value]}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Инспектор перехода (одна строка Transition table): «откуда» (состояние, интент, условия) и «куда» (целевое состояние, ответ системы). */
export function EdgePanel({ step, steps, states, descriptions, intents, dependencies, entities, issues, targetPrompt, onPatch, onCreateConditionStates, onRemove, onSelectState }: Props) {
  const plan = planConditionStates(step, dependencies, entities, steps);
  const errors = issues.filter((i) => i.level === 'error');
  const target = splitNext(step.next_states)[0] ?? '';
  return (
    <PanelRoot>
      <PanelHeader>
        <TypeToken kind="intent" className="font-sans text-[11px] uppercase tracking-wide">Переход</TypeToken>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Удалить переход" onClick={onRemove}><Trash2 className="size-4" /></Button>
        </div>
      </PanelHeader>
      {errors.length > 0 && (
        <ul className="space-y-1 text-xs">
          {errors.map((i, n) => (
            <li key={n} className="flex items-start gap-1.5 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {i.text}
            </li>
          ))}
        </ul>
      )}
      <PanelSection title="Откуда">
        <div>
          <DialogLabel>Состояние</DialogLabel>
          <StateSelect value={step.state} states={states} descriptions={descriptions} label="Исходное состояние" onChange={(state) => onPatch({ state })} />
        </div>
        <div>
          <DialogLabel>Интент</DialogLabel>
          <IntentSelect intents={intents} value={step.intent_id} anyIntent={step.match_any_intent} onChange={(intent_id, match_any_intent) => onPatch({ intent_id, match_any_intent })} label="Интент" hideValueHint fieldClassName={FIELD} />
        </div>
        <div>
          <DialogLabel>Условия</DialogLabel>
          <ConditionsCell conditions={step.conditions} freeText={step.condition} mode={step.cond_mode} dependencies={dependencies} entities={entities} onChange={onPatch} stacked />
          <div className="mt-3 space-y-2 border-t pt-3">
            <Button size="sm" variant="outline" className="h-auto w-full whitespace-normal py-1.5" disabled={!!plan.error || !plan.combinations.length || !step.state.trim()} onClick={onCreateConditionStates}>Создать состояния для всех сочетаний условий ({plan.combinations.length})</Button>
            {plan.error ? <p role="status" className="text-xs text-muted-foreground">{plan.error}</p> : <>
              <p className="text-xs text-muted-foreground">{plan.combinations.length ? 'Только недостающие сочетания условий для этого исходного состояния и интента. Свободные условия сохранятся.' : 'Переходы для всех сочетаний условий уже существуют.'}</p>
              {!!plan.combinations.length && <p className="text-xs text-muted-foreground">Новые состояния получат ответ и действия выбранного целевого состояния.</p>}
            </>}
          </div>
        </div>
      </PanelSection>
      <PanelSection title="Куда">
        <div>
          <DialogLabel>Состояние</DialogLabel>
          <StateSelect value={target} states={states} descriptions={descriptions} label="Следующее состояние" onChange={(next_states) => onPatch({ next_states })} />
        </div>
        <div>
          <DialogLabel>Ответ системы</DialogLabel>
          {targetPrompt ? <TypeToken kind="prompt">{targetPrompt}</TypeToken> : <p className="text-xs text-muted-foreground">Не выбран.</p>}
          {target && (
            <p className="mt-1 text-xs text-muted-foreground">
              Задаётся в состоянии{' '}
              <button type="button" className="font-mono text-brand hover:underline" onClick={() => onSelectState(target)}>{target}</button>.
            </p>
          )}
        </div>
      </PanelSection>
      <PanelSection title="Дополнительно">
        <div>
          <DialogLabel>Пример запроса (необязательно)</DialogLabel>
          <Textarea rows={1} className={cn(FIELD,'field-sizing-content min-h-9')} value={step.request_params} onChange={(e) => onPatch({ request_params: e.target.value })} aria-label="Пример запроса" />
        </div>
      </PanelSection>
    </PanelRoot>
  );
}
