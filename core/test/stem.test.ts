import { describe, expect, it } from 'vitest';
import { findSlots, phraseKey, stem } from '../src/stem';

describe('stem', () => {
  it('сводит формы одного слова к одной основе', () => {
    expect(stem('заказать')).toBe(stem('заказал'));
    expect(stem('заказали')).toBe(stem('заказать'));
    expect(stem('пиццу')).toBe(stem('пицца'));
    expect(stem('пиццы')).toBe(stem('пицца'));
    expect(stem('карты')).toBe(stem('картой'));
  });
  it('не трогает латиницу и цифры', () => {
    expect(stem('Pizza')).toBe('pizza');
    expect(stem('42')).toBe('42');
  });
});

describe('phraseKey', () => {
  it('без нормализации различает формы слов', () => {
    expect(phraseKey('Заказать пиццу', false)).not.toBe(phraseKey('заказал пиццы', false));
  });
  it('с нормализацией считает их одинаковыми', () => {
    expect(phraseKey('Заказать  пиццу', true)).toBe(phraseKey('заказал пиццы', true));
  });
});

describe('findSlots', () => {
  it('находит точное вхождение без нормализации', () => {
    expect(findSlots('хочу пицца', ['пицца'], false)).toEqual([[5, 10]]);
    expect(findSlots('хочу пиццу', ['пицца'], false)).toEqual([]);
  });
  it('находит другую форму слова с нормализацией', () => {
    expect(findSlots('хочу пиццу', ['пицца'], true)).toEqual([[5, 10]]);
  });
  it('находит многословное значение', () => {
    expect(findSlots('в красной карте', ['красная карта'], true)).toEqual([[2, 15]]);
  });
});
