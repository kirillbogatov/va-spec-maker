import { describe, expect, it } from 'vitest';
import { matchKeywords } from '../src/keywords';

const kws = [
  { name: 'OFF', synonyms: ['выключить', 'отключить'] },
  { name: 'SOUND', synonyms: ['звук', 'радио'] },
  { name: 'SET', synonyms: ['поставить', 'установить'] },
  { name: 'TEMPERATURE', synonyms: ['температура', 'температуру'] },
  { name: 'WARMER', synonyms: ['чуть теплее', 'теплее'] },
];

describe('matchKeywords', () => {
  it('находит по основе слова и сохраняет порядок появления во фразе', () => {
    expect(matchKeywords('выключи звук', kws)).toEqual(['OFF', 'SOUND']);
    expect(matchKeywords('радио отключи', kws)).toEqual(['SOUND', 'OFF']);
  });
  it('не учитывает регистр и повторы', () => {
    expect(matchKeywords('Звук звука ЗВУК', kws)).toEqual(['SOUND']);
  });
  it('многословный синоним совпадает только подряд', () => {
    expect(matchKeywords('сделай чуть теплее', kws)).toEqual(['WARMER']);
    expect(matchKeywords('чуть-чуть холодно', [{ name: 'W', synonyms: ['чуть теплее'] }])).toEqual([]);
  });
  it('код ключевого слова тоже считается синонимом', () => {
    expect(matchKeywords('set temperature', kws)).toEqual(['SET', 'TEMPERATURE']);
  });
  it('пустая фраза и пустые синонимы дают пустой результат', () => {
    expect(matchKeywords('', kws)).toEqual([]);
    expect(matchKeywords('привет', [{ name: 'X', synonyms: ['', '  '] }])).toEqual([]);
  });
});
