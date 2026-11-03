import { describe, expect, it } from 'vitest';
import { newTransition } from '@/lib/fsm';
import { pasteState, readStateClipboard, writeStateClipboard } from './stateClipboard';

describe('stateClipboard', () => {
  it('переносит свойства состояния и создаёт независимую копию со свободным именем', () => {
    const info = { x: 10, y: 20, description: 'Описание', prompt_id: 7, system_action: 'open()' };
    const copied = readStateClipboard(writeStateClipboard('ST_TEST', info))!;
    const steps = [newTransition('ST_TEST', 'ST_TEST_2')];
    const result = pasteState(copied, steps, { ST_TEST: info });
    expect(result.name).toBe('ST_TEST_3');
    expect(result.layout.ST_TEST_3).toEqual({ ...info, x: 0, y: 0 });
    expect(result.steps).toBe(steps);
    result.layout.ST_TEST_3.description = 'Изменено';
    expect(info.description).toBe('Описание');
    expect(copied.info.description).toBe('Описание');
  });
  it('допускает состояние без свойств и повторную вставку', () => {
    const copied = readStateClipboard(writeStateClipboard('ST_NEW'))!;
    const first = pasteState(copied, [], {});
    const second = pasteState(copied, [], first.layout);
    expect(first.name).toBe('ST_NEW');
    expect(second.name).toBe('ST_NEW_2');
  });
  it('игнорирует обычный текст и неверные данные из буфера', () => {
    for (const text of ['текст', 'null', '{}', JSON.stringify({ type: 'va-spec-maker/state', version: 1, name: 'X', info: { x: 0, y: 0, prompt_id: 'bad' } })]) {
      expect(readStateClipboard(text)).toBeNull();
    }
  });
});
