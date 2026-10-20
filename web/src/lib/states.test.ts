import { describe, expect, it } from 'vitest';
import { analyzeSteps, layoutGraph, splitNext } from './states';
import type { Step } from './types';

const step = (p: Partial<Step>): Step => ({
  key: Math.random().toString(), kind: 'transition', state: '', intent_id: null, request_params: '', condition: '', conditions: [],
  prompt_id: 1, system_action: '', next_states: '', ...p,
});

describe('splitNext', () => {
  it('делит по разделителям и стрелкам', () => {
    expect(splitNext('ST_A, ST_B; ST_C -> ST_D')).toEqual(['ST_A', 'ST_B', 'ST_C', 'ST_D']);
  });
});

describe('analyzeSteps', () => {
  const name = (id: number | null) => (id === 7 ? 'INT_YES' : null);
  it('строит рёбра (по одному на строку), находит состояния без исходящих и недостижимые', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B END', intent_id: 7 });
    const b = step({ state: 'ST_B', next_states: 'ST_MISSING' });
    const c = step({ state: 'ST_LONELY' });
    const r = analyzeSteps([a, b, c], name);
    expect(r.states).toEqual(['ST_A', 'ST_B', 'ST_LONELY']);
    expect(r.edges).toContainEqual({ id: `${a.key}|ST_B`, stepKey: a.key, from: 'ST_A', to: 'ST_B', label: 'INT_YES' });
    expect(r.edges.some((e) => e.from === 'ST_A' && e.to === 'END')).toBe(true);
    expect(r.dangling).toEqual(['ST_MISSING']);
    expect(r.unreachable).toEqual(['ST_LONELY']);
    expect(r.issues.get(b.key!)?.[0].level).toBe('warn');
  });
  it('не склеивает параллельные рёбра между одной парой состояний', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7, conditions: [{ dep: 'x', value: '1' }] });
    const b = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7, conditions: [{ dep: 'x', value: '2' }] });
    expect(analyzeSteps([a, b], name).edges).toHaveLength(2);
  });
  it('предупреждает о строке без состояния и без следующего состояния', () => {
    const s = step({ state: '', next_states: '' });
    const r = analyzeSteps([s], name);
    expect(r.issues.get(s.key!)?.map((i) => i.level)).toContain('error');
    expect(r.issues.get(s.key!)?.some((i) => i.level === 'warn')).toBe(true);
  });
  it('требует ответ ассистента у состояний, кроме входа', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B' });
    const b = step({ state: 'ST_B', next_states: 'ST_C' });
    const r = analyzeSteps([a, b], name, { ST_B: { x: 0, y: 0, prompt_id: 5 } });
    expect([...r.stateIssues.keys()]).toEqual(['ST_C']);
  });
  it('находит одинаковые условия у переходов из одного состояния по одному интенту', () => {
    const c = [{ dep: 'x', value: '1' }];
    const a = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7, conditions: c });
    const b = step({ state: 'ST_A', next_states: 'ST_C', intent_id: 7, conditions: [...c] });
    const r = analyzeSteps([a, b], name);
    expect(r.issues.get(a.key!)?.some((i) => i.level === 'error')).toBeFalsy();
    expect(r.issues.get(b.key!)?.some((i) => i.level === 'error' && i.text.startsWith('Те же условия'))).toBe(true);
  });
  it('предупреждает, если переход без условий стоит не последним, и не трогает разные интенты', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7 });
    const b = step({ state: 'ST_A', next_states: 'ST_C', intent_id: 7, conditions: [{ dep: 'x', value: '1' }] });
    const other = step({ state: 'ST_A', next_states: 'ST_C', intent_id: 8 });
    const r = analyzeSteps([a, b, other], name);
    expect(r.issues.get(a.key!)?.some((i) => i.level === 'warn' && i.text.startsWith('Переход без условий'))).toBe(true);
    expect(r.issues.get(other.key!)?.some((i) => i.text.startsWith('Переход без условий'))).toBeFalsy();
  });
});

describe('layoutGraph', () => {
  it('раскладывает по слоям от входа', () => {
    const { nodes } = layoutGraph(['A_1', 'B_2'], [{ id: '1', stepKey: '1', from: 'A_1', to: 'B_2', label: '' }]);
    expect(nodes.find((n) => n.name === 'A_1')!.layer).toBe(0);
    expect(nodes.find((n) => n.name === 'B_2')!.layer).toBe(1);
  });
});
