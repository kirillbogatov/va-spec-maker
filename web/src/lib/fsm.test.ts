import { describe, expect, it } from 'vitest';
import { canonicalOrder, ENTRY_STATE, makeEntry, normalizeEntry, moveEdge, newTransition, removeState, renameState, splitLegacySteps, uniqueStateName } from './fsm';
import type { Step } from './types';

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
