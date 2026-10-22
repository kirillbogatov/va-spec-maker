import { describe, expect, it } from 'vitest';
import { DEFAULT_KIND, entityTypeLabel, hasRange, rangeError, rangeSummary } from './entityTypes';

describe('entityTypes', () => {
  it('has a range only for number, time and date', () => {
    expect(['string', 'number', 'time', 'date', 'boolean'].map((t) => hasRange(t as never))).toEqual([false, true, true, true, false]);
  });

  it('labels types in Russian', () => {
    expect(entityTypeLabel('boolean')).toBe('Логический');
    expect(DEFAULT_KIND).toEqual({ type: 'string', range_min: '', range_max: '' });
  });

  it('detects an inverted range', () => {
    expect(rangeError({ type: 'number', range_min: '30', range_max: '15' })).toBe('Начало диапазона больше конца');
    expect(rangeError({ type: 'number', range_min: '9', range_max: '10' })).toBeNull();
    expect(rangeError({ type: 'time', range_min: '22:00', range_max: '06:00' })).not.toBeNull();
    expect(rangeError({ type: 'date', range_min: '2026-01-01', range_max: '' })).toBeNull();
  });

  it('summarises a range', () => {
    expect(rangeSummary({ type: 'number', range_min: '15', range_max: '30' })).toBe('от 15 до 30');
    expect(rangeSummary({ type: 'number', range_min: '15', range_max: '' })).toBe('от 15');
    expect(rangeSummary({ type: 'time', range_min: '', range_max: '23:00' })).toBe('до 23:00');
    expect(rangeSummary({ type: 'string', range_min: '', range_max: '' })).toBe('');
  });
});
