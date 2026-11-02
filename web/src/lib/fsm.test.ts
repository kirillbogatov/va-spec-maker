import { analyzeSteps } from './states';
import { duplicateState } from './fsm';
import { describe, expect, it } from 'vitest';
import { canonicalOrder, ENTRY_STATE, makeEntry, normalizeEntry, moveEdge, newTransition, removeState, renameState, splitLegacySteps, uniqueStateName } from './fsm';
import type { Step, Layout } from './types';

const step = (key: string, state: string, next: string, p: Partial<Step> = {}): Step => ({
  key, kind: 'transition', state, intent_id: null, request_params: '', condition: '', conditions: [],
  prompt_id: null, system_action: '', next_states: next, ...p,
});
const keys = (steps: Step[]) => steps.map((s) => s.key);

describe('splitLegacySteps', () => {
  it('разбивает строку с несколькими следующими состояниями на рёбра с копиями полей', () => {
    const src = step('a', 'ST_A', 'ST_B, ST_C', { system_action: 'X', conditions: [{ dep: 'd', value: '1' }] });
    const out = splitLegacySteps([src]);
    expect(out.map((s) => s.next_states)).toEqual(['ST_B', 'ST_C']);
    expect(out[0].key).toBe('a');
    expect(out[1].key).not.toBe('a');
    expect(out.every((s) => s.system_action === 'X' && s.state === 'ST_A')).toBe(true);
    out[1].conditions[0].value = '2';
    expect(out[0].conditions[0].value).toBe('1');
  });
  it('не трогает строки с одним значением, пустые и Errors', () => {
    const rows = [step('a', 'A_1', 'B_2'), step('b', 'A_1', ''), step('c', 'E_1', 'X_1 Y_1', { kind: 'error' })];
    expect(splitLegacySteps(rows)).toEqual(rows);
  });
});

describe('canonicalOrder', () => {
  it('обходит в ширину от входа, держит порядок внутри состояния, недостижимые в конце, Errors после', () => {
    const err = step('e', 'DRIVER_ONLY', 'ST_A', { kind: 'error' });
    const rows = [step('1', 'ST_A', 'ST_B'), step('2', 'ST_D', 'ST_A'), step('3', 'ST_B', 'ST_C'), step('4', 'ST_A', 'ST_C'), err];
    expect(keys(canonicalOrder(rows))).toEqual(['1', '4', '3', '2', 'e']);
  });
  it('оставляет пустой список пустым', () => {
    expect(canonicalOrder([])).toEqual([]);
  });
});

describe('операции над состояниями', () => {
  const rows = [step('1', 'ST_A', 'ST_B'), step('2', 'ST_B', 'ST_A'), step('3', 'ST_B', 'END')];
  const layout = { ST_A: { x: 0, y: 0 }, ST_B: { x: 240, y: 0 } };

  it('renameState переименовывает источник, цели и раскладку', () => {
    const r = renameState(rows, layout, 'ST_B', 'ST_WAIT');
    expect(r.steps.map((s) => [s.state, s.next_states])).toEqual([['ST_A', 'ST_WAIT'], ['ST_WAIT', 'ST_A'], ['ST_WAIT', 'END']]);
    expect(Object.keys(r.layout)).toEqual(['ST_A', 'ST_WAIT']);
  });
  it('removeState удаляет все рёбра, входящие и исходящие, и запись раскладки', () => {
    const r = removeState(rows, layout, 'ST_B');
    expect(r.steps).toEqual([]);
    expect(r.layout).toEqual({ ST_A: { x: 0, y: 0 } });
  });
  it('moveEdge меняет местами соседние рёбра одного состояния и не выходит за границы', () => {
    const three = [step('1', 'ST_A', 'X_1'), step('2', 'ST_B', 'X_1'), step('3', 'ST_A', 'Y_1')];
    expect(keys(moveEdge(three, '3', -1))).toEqual(['3', '2', '1']);
    expect(keys(moveEdge(three, '1', -1))).toEqual(['1', '2', '3']);
    expect(keys(moveEdge(three, '3', 1))).toEqual(['1', '2', '3']);
  });
  it('makeEntry переносит строки состояния в начало', () => {
    expect(keys(makeEntry(rows, 'ST_B'))).toEqual(['2', '3', '1']);
  });
  it('uniqueStateName и newTransition', () => {
    expect(uniqueStateName(['ST_NEW', 'ST_NEW_2'])).toBe('ST_NEW_3');
    expect(uniqueStateName([])).toBe('ST_NEW');
    const t = newTransition('A_1', 'B_2');
    expect(t).toMatchObject({ kind: 'transition', state: 'A_1', next_states: 'B_2', intent_id: null, prompt_id: null });
    expect(t.key).toBeTruthy();
  });
  it('normalizeEntry называет вход VA_ACTIVATION и меняется именами при конфликте', () => {
    const a = normalizeEntry([step('1', 'ST_X', 'ST_Y'), step('2', 'ST_Y', 'ST_X')], { ST_X: { x: 0, y: 0 } });
    expect(a.steps.map((s) => [s.state, s.next_states])).toEqual([[ENTRY_STATE, 'ST_Y'], ['ST_Y', ENTRY_STATE]]);
    expect(Object.keys(a.layout)).toEqual([ENTRY_STATE]);
    const b = normalizeEntry([step('1', 'ST_X', 'VA_ACTIVATION'), step('2', 'VA_ACTIVATION', 'ST_X')], {});
    expect(b.steps.map((s) => [s.state, s.next_states])).toEqual([[ENTRY_STATE, 'ST_X'], ['ST_X', ENTRY_STATE]]);
    expect(normalizeEntry([], {}).steps).toEqual([]);
  });
});

describe('duplicateState', () => {
  it('прикрепляет копию к родителю с независимыми условиями и сохраняет свойства состояния', () => {
    const incoming: Step = {
      ...newTransition('VA_ACTIVATION', 'ST_CHILD'), intent_id: 7,
      condition: 'custom check', cond_mode: 'any', request_params: 'params',
      conditions: [{ dep: 'ready', value: 'yes' }, { dep: '', value: '', keyword_id: 3, op: '!=' }],
    };
    const outgoing = newTransition('ST_CHILD', 'END');
    const layout: Layout = { ST_CHILD: { x: 0, y: 0, description: 'Описание', prompt_id: 5, system_action: 'action' } };
    const result = duplicateState([incoming, outgoing], layout, 'ST_CHILD');
    expect(result.name).toBe('ST_CHILD_2');
    const copied = result.steps.find((s) => s.state === 'VA_ACTIVATION' && s.next_states === result.name)!;
    expect(copied).toEqual({ ...incoming, key: expect.any(String), next_states: result.name });
    expect(copied.key).not.toBe(incoming.key);
    expect(copied.conditions).not.toBe(incoming.conditions);
    expect(copied.conditions[0]).not.toBe(incoming.conditions[0]);
    expect(result.layout[result.name]).toEqual(layout.ST_CHILD);
    expect(result.layout[result.name]).not.toBe(layout.ST_CHILD);
    expect(result.steps.some((s) => s.state === result.name && s.next_states === 'END')).toBe(true);
    expect(analyzeSteps(result.steps, () => null, result.layout).unreachable).not.toContain(result.name);
    expect(layout).not.toHaveProperty(result.name);
    expect(incoming.next_states).toBe('ST_CHILD');
  });

  it('сохраняет все родительские переходы и не копирует посторонние ветки старого формата', () => {
    const a = newTransition('ST_A', 'ST_CHILD ST_OTHER');
    const b = newTransition('ST_B', 'ST_CHILD');
    const global: Step = { ...newTransition('', 'ST_CHILD'), kind: 'global' };
    const error: Step = { ...newTransition('ST_CHILD', 'END'), kind: 'error' };
    const { steps, name } = duplicateState([a, b, global, error], {}, 'ST_CHILD');
    expect(steps.filter((s) => s.next_states === name).map((s) => s.state)).toEqual(['ST_A', 'ST_B']);
    expect(steps).toContain(a);
    expect(steps).toContain(b);
    expect(steps.filter((s) => s.kind !== 'transition')).toEqual([global, error]);
    expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length);
  });

  it('копирует петлю в петлю нового состояния', () => {
    const loop = newTransition('ST_LOOP', 'ST_LOOP');
    const { steps, name } = duplicateState([loop], {}, 'ST_LOOP');
    expect(steps).toHaveLength(2);
    expect(steps[1]).toMatchObject({ state: name, next_states: name });
  });

  it('создаёт уникальные имена с учётом раскладки, исходных и целевых состояний', () => {
    const steps = [newTransition('ST_CHILD_3', 'ST_CHILD_4')];
    const layout = { ST_CHILD: { x: 0, y: 0 }, ST_CHILD_2: { x: 0, y: 0 } };
    const first = duplicateState(steps, layout, 'ST_CHILD');
    expect(first.name).toBe('ST_CHILD_5');
    expect(duplicateState(first.steps, first.layout, 'ST_CHILD').name).toBe('ST_CHILD_6');
  });

  it('дублирует изолированное состояние и конечное состояние без собственной раскладки', () => {
    const isolated = duplicateState([], { ST_ALONE: { x: 0, y: 0, description: 'Один' } }, 'ST_ALONE');
    expect(isolated.steps).toEqual([]);
    expect(isolated.layout[isolated.name].description).toBe('Один');
    const terminal = duplicateState([newTransition('VA_ACTIVATION', 'END')], {}, 'END');
    expect(terminal.steps[1]).toMatchObject({ state: 'VA_ACTIVATION', next_states: terminal.name });
    expect(terminal.layout[terminal.name]).toEqual({ x: 0, y: 0 });
  });
});
