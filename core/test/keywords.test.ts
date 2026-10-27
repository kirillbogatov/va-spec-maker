import { describe, expect, it } from 'vitest';
import { cleanKeywordName, keywordsToTxt, matchKeywords, parseKeywordsTxt } from '../src/keywords';

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

describe('keywords txt', () => {
  it('разбирает строки «КОД: синонимы»', () => {
    const r = parseKeywordsTxt('OFF: выключи, отключи\r\n\r\n# комментарий\n$SOUND: звук , радио,звук\nBARE\nOFF: вырубить\n: без кода\n');
    expect(r.items).toEqual([
      { name: 'SOUND', synonyms: ['звук', 'радио'] },
      { name: 'BARE', synonyms: [] },
      { name: 'OFF', synonyms: ['вырубить'] },
    ]);
    expect(r.skipped).toBe(1);
  });
  it('собирает txt и разбирается обратно без потерь', () => {
    const items = [{ name: 'OFF', synonyms: ['выключи', 'отключи'] }, { name: 'X', synonyms: [] }];
    const txt = keywordsToTxt(items);
    expect(txt).toBe('OFF: выключи, отключи\nX:\n');
    expect(parseKeywordsTxt(txt).items).toEqual(items);
  });
  it('cleanKeywordName отбрасывает $ и лишние пробелы', () => {
    expect(cleanKeywordName('  $$ OFF  ')).toBe('OFF');
  });
});
