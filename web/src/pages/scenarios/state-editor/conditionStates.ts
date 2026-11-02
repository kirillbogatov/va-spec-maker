import { uniqueStateName } from '@/lib/fsm';
import { splitNext } from '@/lib/states';
import type { Keyword, Dependency, EntityListItem, Layout, Step, StepCondition } from '@/lib/types';
import { conditionLabel, validValue, valueSpec } from '../dependencies';

const MAX_STATES = 256;
export interface ConditionStatePlan { combinations: StepCondition[][]; preserveSource?: boolean; error?: string }
const subject = (c: StepCondition) => c.keyword_id !== undefined ? `c:${c.keyword_id}` : c.entity_id !== undefined ? `e:${c.entity_id}` : `d:${c.dep}`;

/** Порядок условий, повторы и явно заданные значения по умолчанию не меняют смысл перехода. */
function signature(step: Step, dependencies: Dependency[]): string {
  const conditions = [...new Set(step.conditions.map((c) => {
    const entityId = c.entity_id ?? (c.keyword_id === undefined ? dependencies.find((d) => d.ref === c.dep)?.entity_id : undefined);
    const key = c.keyword_id !== undefined ? subject(c) : entityId != null ? `e:${entityId}` : subject(c);
    return JSON.stringify([key, c.op ?? '=', c.keyword_id !== undefined ? '' : c.value]);
  }))].sort();
  const texts = [...new Set(step.condition.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))].sort();
  return JSON.stringify([conditions, texts, conditions.length + texts.length > 1 ? step.cond_mode ?? 'all' : 'all']);
}

/** Значения справочников образуют декартово произведение; свободные условия остаются фиксированными. */
export function planConditionStates(step: Step, dependencies: Dependency[], entities: EntityListItem[], steps: Step[] = []): ConditionStatePlan {
  const fail = (error: string): ConditionStatePlan => ({ combinations: [], error });
  if (!step.conditions.length) return fail('Добавьте условие по зависимости или сущности со значениями из справочника.');
  const domains = new Map<string, string[]>();
  for (const c of step.conditions) {
    if (c.keyword_id !== undefined) continue;
    const known = c.entity_id !== undefined ? entities.some((e) => e.id === c.entity_id) : dependencies.some((d) => d.ref === c.dep);
    if (!known) return fail('Выберите существующую зависимость или сущность для каждого условия.');
    const spec = valueSpec(c, dependencies, entities);
    if (spec.choices) {
      if (c.op && c.op !== '=') return fail('Для перебора значений справочника выберите оператор «=».');
      domains.set(subject(c), [...new Set(spec.choices)]);
    } else if (!c.value.trim() || !validValue(spec.input, c.value)) {
      return fail('Заполните корректные значения условий со свободным вводом.');
    }
  }
  if (!domains.size) return fail('У выбранных условий нет списка значений. Добавьте условие по справочнику или булевому полю.');
  let count = 1;
  for (const values of domains.values()) {
    count *= values.length;
    if (count > MAX_STATES) return fail(`Получается больше ${MAX_STATES} состояний. Уменьшите число условий или значений.`);
  }
  if (!count) return fail('В справочнике нет значений.');
  let combinations: StepCondition[][] = [step.conditions.map((c) => ({ ...c }))];
  for (const [key, values] of domains) {
    combinations = combinations.flatMap((conditions) => values.map((value) => conditions.map((c) => ({ ...c, ...(subject(c) === key ? { value } : {}) }))));
  }
  const preserveSource = combinations.some((conditions) => signature({ ...step, conditions }, dependencies) === signature(step, dependencies));
  const existing = new Set(steps.filter((s) => s.kind === 'transition' && s.state.trim() === step.state.trim() && s.intent_id === step.intent_id).map((s) => signature(s, dependencies)));
  combinations = combinations.filter((conditions) => {
    const sig = signature({ ...step, conditions }, dependencies);
    if (existing.has(sig)) return false;
    existing.add(sig);
    return true;
  });
  return { combinations, preserveSource };
}

/** Добавляет недостающие ветки; незаполненный переход-шаблон заменяется, готовые переходы сохраняются. */
export function createConditionStates(
  steps: Step[], layout: Layout, key: string, dependencies: Dependency[], entities: EntityListItem[], keywords: Keyword[] = [], statePrefix = 'ST_',
): { steps: Step[]; layout: Layout; count: number } {
  const step = steps.find((s) => s.key === key);
  if (!step || step.kind !== 'transition' || !step.state.trim()) throw new Error('Выберите переход с исходным состоянием.');
  const plan = planConditionStates(step, dependencies, entities, steps);
  if (plan.error) throw new Error(plan.error);
  if (!plan.combinations.length) return { steps, layout, count: 0 };
  const target = splitNext(step.next_states)[0];
  const taken = [...Object.keys(layout), ...steps.flatMap((s) => [s.state.trim(), ...splitNext(s.next_states)])];
  const nextLayout = { ...layout };
  const branches = plan.combinations.map((conditions, i): Step => {
    const name = uniqueStateName(taken, `${target || `${statePrefix}CONDITION`}_${i + 1}`);
    taken.push(name);
    const description = conditions.map((c) => conditionLabel(c, dependencies, entities, keywords)).join('; ');
    nextLayout[name] = { ...(layout[target] ?? { x: 0, y: 0 }), description: [layout[target]?.description, description].filter(Boolean).join('\n') };
    return { ...step, key: i === 0 && !plan.preserveSource ? step.key : crypto.randomUUID(), conditions, next_states: name };
  });
  return { steps: steps.flatMap((s) => s === step ? [...(plan.preserveSource ? [s] : []), ...branches] : [s]), layout: nextLayout, count: branches.length };
}
