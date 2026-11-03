import { describe, expect, it } from 'vitest';
import { newTransition } from '@/lib/fsm';
import type { ScenarioPart } from '@/lib/types';
import { duplicatePart } from './duplicatePart';

describe('duplicatePart', () => {
  it('копирует все виды шагов и состояния, сохраняя ссылки на справочники', () => {
    const source: ScenarioPart = {
      key: 'source', name: 'Основная', description: 'Описание',
      steps: [
        { ...newTransition('VA_ACTIVATION', 'ST_DONE'), intent_id: 7, conditions: [{ dep: 'zone', value: 'rear' }] },
        { ...newTransition('', 'ST_DONE'), kind: 'error', prompt_id: 9 },
        { ...newTransition('', 'ST_DONE'), kind: 'global', intent_id: 11 },
      ],
      layout: { VA_ACTIVATION: { x: 1, y: 2 }, ST_DONE: { x: 3, y: 4, description: 'Готово', prompt_id: 9 }, ST_ISOLATED: { x: 0, y: 0 } },
    };
    const copy = duplicatePart(source, [source]);
    expect(copy.name).toBe('Основная — копия');
    expect(copy.description).toBe(source.description);
    expect(copy.layout).toEqual(source.layout);
    expect(copy.key).not.toBe(source.key);
    expect(new Set([source.key, copy.key, ...source.steps.map((s) => s.key), ...copy.steps.map((s) => s.key)]).size).toBe(8);
    expect(copy.steps.map(({ key: _key, ...s }) => s)).toEqual(source.steps.map(({ key: _key, ...s }) => s));
    copy.steps[0].conditions[0].value = 'front';
    copy.layout.ST_DONE.description = 'Копия';
    expect(source.steps[0].conditions[0].value).toBe('rear');
    expect(source.layout.ST_DONE.description).toBe('Готово');
  });
  it('выбирает свободное имя при повторном копировании и допускает пустую вкладку', () => {
    const part: ScenarioPart = { name: 'Тест', description: '', steps: [], layout: {} };
    const first = duplicatePart(part, [part]);
    const second = duplicatePart(part, [part, first]);
    expect(second.name).toBe('Тест — копия 2');
    expect(second.steps).toEqual([]);
    expect(second.layout).toEqual({});
  });
});
