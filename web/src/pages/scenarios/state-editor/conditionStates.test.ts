import { describe, expect, it } from 'vitest';
import { newTransition } from '@/lib/fsm';
import type { Dependency, EntityListItem, Layout, Step } from '@/lib/types';
import { createConditionStates, planConditionStates } from './conditionStates';

const deps: Dependency[] = [
  { ref: 'zone', name: 'Зона', entity_id: null, type: 'enum', options: ['front', 'rear', 'all'] },
  { ref: 'mode', name: 'Режим', entity_id: null, type: 'bool', options: [] },
];
const transition = (): Step => ({ ...newTransition('VA_ACTIVATION', 'ST_TARGET'), conditions: [{ dep: 'zone', value: 'front' }] });

describe('planConditionStates', () => {
  it('берёт все значения справочника, включая ещё не выбранные', () => {
    const plan = planConditionStates(transition(), deps, []);
    expect(plan.error).toBeUndefined();
    expect(plan.combinations.map((cs) => cs[0].value)).toEqual(['front', 'rear', 'all']);
  });

  it('строит 3 × 2 комбинации и сохраняет свободные условия и концепты', () => {
    const step = transition();
    step.conditions.push({ dep: 'mode', value: '' }, { dep: '', keyword_id: 8, op: '!=', value: '' });
    const plan = planConditionStates(step, deps, []);
    expect(plan.combinations.map((cs) => cs.slice(0, 2).map((c) => c.value))).toEqual([
      ['front', 'true'], ['front', 'false'], ['rear', 'true'], ['rear', 'false'], ['all', 'true'], ['all', 'false'],
    ]);
    expect(plan.combinations.every((cs) => cs[2].keyword_id === 8 && cs[2].op === '!=')).toBe(true);
    expect(step.conditions[1].value).toBe('');
  });

  it('использует значения сущностей и связанных зависимостей', () => {
    const entity = { id: 9, type: 'string', values: [{ value: 'A', synonyms: ['a'] }, { value: 'B', synonyms: [] }] } as EntityListItem;
    const step = { ...transition(), conditions: [{ dep: '', entity_id: 9, value: '' }] };
    expect(planConditionStates(step, deps, [entity]).combinations.map((cs) => cs[0].value)).toEqual(['A', 'B']);
    const linked = [{ ...deps[0], entity_id: 9 }];
    expect(planConditionStates(transition(), linked, [entity]).combinations).toHaveLength(2);
  });

  it('не умножает повторяющиеся значения и условия одной зависимости', () => {
    const step = transition();
    step.conditions.push({ dep: 'zone', value: 'rear' });
    const plan = planConditionStates(step, [{ ...deps[0], options: ['front', 'front', 'rear'] }], []);
    expect(plan.combinations.map((cs) => cs.map((c) => c.value))).toEqual([['front', 'front'], ['rear', 'rear']]);
  });

  it('объясняет отсутствие списков, неверные операторы и слишком большое число комбинаций', () => {
    expect(planConditionStates(newTransition('ST_A', ''), deps, []).error).toBeTruthy();
    const step = transition();
    step.conditions[0].op = '!=';
    expect(planConditionStates(step, deps, []).error).toContain('оператор');
    const many = { ...deps[0], options: Array.from({ length: 257 }, (_, i) => String(i)) };
    expect(planConditionStates(transition(), [many], []).error).toContain('256');
    expect(planConditionStates(transition(), [], []).error).toContain('существующую');
    expect(planConditionStates(transition(), [{ ...deps[0], type: 'string', options: [] }], []).error).toContain('нет списка');
  });
});

describe('createConditionStates', () => {
  it('создаёт независимые состояния и переходы, сохраняет исходный граф и свойства цели', () => {
    const step = { ...transition(), intent_id: 7, condition: 'custom', request_params: 'request', cond_mode: 'any' as const };
    const unrelated = newTransition('ST_OTHER', 'ST_TARGET');
    const layout: Layout = { ST_TARGET: { x: 0, y: 0, description: 'Ответ', prompt_id: 9, system_action: 'action' }, ST_TARGET_1: { x: 0, y: 0 } };
    const result = createConditionStates([step, unrelated], layout, step.key!, deps, []);
    expect(result.count).toBe(2);
    expect(result.steps).toHaveLength(4);
    expect(result.steps[3]).toBe(unrelated);
    expect(result.steps[0].key).toBe(step.key);
    expect(new Set(result.steps.map((s) => s.key)).size).toBe(4);
    expect(result.steps[0]).toBe(step);
    for (const branch of result.steps.slice(1, 3)) {
      expect(branch).toMatchObject({ state: 'VA_ACTIVATION', intent_id: 7, condition: 'custom', request_params: 'request', cond_mode: 'any' });
      expect(result.layout[branch.next_states]).toMatchObject({ prompt_id: 9, system_action: 'action' });
      expect(result.layout[branch.next_states].description).toContain(branch.conditions[0].value);
      expect(branch.conditions[0]).not.toBe(step.conditions[0]);
    }
    expect(result.steps[1].next_states).toBe('ST_TARGET_1_2');
    expect(result.layout.ST_TARGET).toBe(layout.ST_TARGET);
    expect(Object.keys(layout)).toHaveLength(2);
    expect(step.next_states).toBe('ST_TARGET');
  });

  it('работает без целевого состояния и не меняет данные при ошибке', () => {
    const step = { ...transition(), next_states: '' };
    const result = createConditionStates([step], {}, step.key!, deps, [], [], 'QA_');
    expect(result.steps[1].next_states).toBe('QA_CONDITION_1');
    expect(() => createConditionStates([step], {}, 'missing', deps, [])).toThrow();
  });

  it('пропускает существующие переходы независимо от цели, порядка условий и явных значений по умолчанию', () => {
    const step = transition();
    step.conditions.push({ dep: 'mode', value: 'true' });
    const existing = { ...step, key: 'existing', next_states: 'ST_ANOTHER', cond_mode: 'all' as const,
      conditions: [{ dep: 'mode', value: 'false', op: '=' as const }, { dep: 'zone', value: 'rear', op: '=' as const }] };
    const plan = planConditionStates(step, deps, [], [step, existing]);
    expect(plan.combinations).toHaveLength(4);
    expect(plan.combinations.some((cs) => cs[0].value === 'rear' && cs[1].value === 'false')).toBe(false);
    const result = createConditionStates([step, existing], {}, step.key!, deps, []);
    expect(result.count).toBe(4);
    expect(result.steps).toContain(step);
    expect(result.steps).toContain(existing);
    const again = createConditionStates(result.steps, result.layout, step.key!, deps, []);
    expect(again.count).toBe(0);
    expect(again.steps).toBe(result.steps);
    expect(again.layout).toBe(result.layout);
    const generatedKey = result.steps.find((s) => s !== step && s !== existing)!.key!;
    expect(createConditionStates(result.steps, result.layout, generatedKey, deps, []).count).toBe(0);
  });

  it('сравнивает условия только внутри того же исходного состояния и интента', () => {
    const step = transition();
    const others = [
      { ...step, key: 'other-intent', intent_id: 99, conditions: [{ dep: 'zone', value: 'rear' }] },
      { ...step, key: 'other-state', state: 'ST_OTHER', conditions: [{ dep: 'zone', value: 'all' }] },
      { ...step, key: 'global', kind: 'global' as const, conditions: [{ dep: 'zone', value: 'rear' }] },
    ];
    expect(createConditionStates([step, ...others], {}, step.key!, deps, []).count).toBe(2);
  });

  it('учитывает свободный текст, операторы и режим объединения условий', () => {
    const step = transition();
    step.conditions.push({ dep: 'mode', value: 'true' });
    const others: Step[] = [
      { ...step, key: 'any', cond_mode: 'any', conditions: [{ dep: 'zone', value: 'rear' }, { dep: 'mode', value: 'false' }] },
      { ...step, key: 'text', condition: 'extra', conditions: [{ dep: 'zone', value: 'all' }, { dep: 'mode', value: 'false' }] },
      { ...step, key: 'op', conditions: [{ dep: 'zone', value: 'rear', op: '!=' }, { dep: 'mode', value: 'true' }] },
    ];
    expect(createConditionStates([step, ...others], {}, step.key!, deps, []).count).toBe(5);
  });

  it('не дублирует условие сущности, заданное через связанную зависимость', () => {
    const entity: EntityListItem = { id: 9, project_id: 1, name: 'Зона', description: '', type: 'string', multiple_values: false,
      range_min: '', range_max: '', used_by: [], value_count: 2, values: [{ value: 'front', synonyms: [] }, { value: 'rear', synonyms: [] }] };
    const linked = [{ ...deps[0], entity_id: 9 }];
    const step = transition();
    const existing = { ...step, key: 'entity', conditions: [{ dep: '', entity_id: 9, value: 'rear', op: '=' as const }] };
    expect(createConditionStates([step, existing], {}, step.key!, linked, [entity]).count).toBe(0);
  });
});
