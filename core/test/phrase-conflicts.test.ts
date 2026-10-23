import { describe, expect, it } from 'vitest';
import { findPhraseConflicts, type IntentForCheck } from '../src/phrase-conflicts';

const room = { name: 'Комната', words: ['спальня', 'спальне', 'кухня', 'кухне', 'зал ожидания', 'гостиная'] };
const intent = (id: number, name: string, phrases: string[], entities: IntentForCheck['entities'] = []): IntentForCheck => ({
  id, name, phrases, entities, scenarios: [],
});

describe('findPhraseConflicts', () => {
  it('finds a verbatim match as exact', () => {
    const r = findPhraseConflicts([intent(1, 'A', ['включи свет']), intent(2, 'B', ['включи свет', 'зажги лампу'])]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'exact', phrase: 'включи свет', other_phrase: 'включи свет', a: { id: 1 }, b: { id: 2 } });
  });

  it('ignores case, punctuation and ё', () => {
    const r = findPhraseConflicts([intent(1, 'A', ['Всё, выключи!']), intent(2, 'B', ['все выключи'])]);
    expect(r.map((x) => x.kind)).toEqual(['exact']);
  });

  it('finds a template match through a shared entity', () => {
    const r = findPhraseConflicts([
      intent(1, 'A', ['включи свет в спальне'], [room]),
      intent(2, 'B', ['включи свет в кухне'], [room]),
    ]);
    expect(r.map((x) => x.kind)).toEqual(['template']);
  });

  it('does not match templates when the entity is not connected to the intent', () => {
    const r = findPhraseConflicts([intent(1, 'A', ['включи свет в спальне'], [room]), intent(2, 'B', ['включи свет в кухне'])]);
    expect(r).toEqual([]);
  });

  it('treats entity-only phrases as follow-up answers, even when verbatim', () => {
    const r = findPhraseConflicts([
      intent(1, 'A', ['спальня', 'в спальне'], [room]),
      intent(2, 'B', ['на кухне', 'спальня'], [room]),
    ]);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.kind === 'followup')).toBe(true);
  });

  it('replaces multi-word values as a whole', () => {
    const r = findPhraseConflicts([
      intent(1, 'A', ['где зал ожидания'], [room]),
      intent(2, 'B', ['где гостиная'], [room]),
    ]);
    expect(r.map((x) => x.kind)).toEqual(['template']);
  });

  it('skips empty phrases and repeats inside one intent', () => {
    const r = findPhraseConflicts([intent(1, 'A', ['', 'привет', 'привет']), intent(2, 'B', ['  ', '...'])]);
    expect(r).toEqual([]);
  });

  it('does not create duplicate pairs when an intent repeats a phrase', () => {
    const r = findPhraseConflicts([intent(1, 'A', ['привет', 'Привет']), intent(2, 'B', ['привет'])]);
    expect(r).toHaveLength(2);
    expect(new Set(r.map((x) => x.phrase)).size).toBe(2);
  });

  it('sorts exact before template before followup', () => {
    const r = findPhraseConflicts([
      intent(1, 'A', ['в спальне', 'включи свет в спальне', 'стоп'], [room]),
      intent(2, 'B', ['на кухне', 'включи свет в кухне', 'стоп'], [room]),
    ]);
    expect(r.map((x) => x.kind)).toEqual(['exact', 'template', 'followup']);
  });
});
