import { describe, expect, it } from 'vitest';
import { csvObjects, parseCsv, toCsv } from './csv';
import {
  dependenciesToCsv, entitiesToCsv, intentsToCsv, parseDependenciesCsv, parseEntitiesCsv, parseIntentsCsv, parsePromptsCsv, promptsToCsv,
} from './dictionaryCsv';

describe('csv', () => {
  it('разбирает кавычки, переводы строк в ячейках, BOM и разные разделители', () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"two\nlines"\r\n\r\n')).toEqual([['a', 'b'], ['x;1', 'two\nlines']]);
    expect(parseCsv('a,b\n"he said ""hi""",2')).toEqual([['a', 'b'], ['he said "hi"', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('собирает и читает обратно без потерь', () => {
    const rows = [['name', 'v'], ['a;b', 'x\ny'], ['q"uote', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('csvObjects берёт колонки по заголовку без учёта регистра', () => {
    expect(csvObjects([[' Name ', 'B'], ['1', '2']])).toEqual([{ name: '1', b: '2' }]);
  });
});

describe('dictionary csv', () => {
  it('зависимости и промпты', () => {
    const deps = [{ name: 'Двигатель', values: ['запущен', 'заглушен'] }];
    expect(parseDependenciesCsv(dependenciesToCsv(deps))).toEqual(deps);
    const prm = [{ name: 'PRM_A', answers: ['Привет, мир', 'Ещё; ответ'] }];
    expect(parsePromptsCsv(promptsToCsv(prm))).toEqual(prm);
  });
  it('сущности: тип, диапазон, значения с синонимами', () => {
    const e = [
      { name: 'ROOM', description: 'Комната', type: 'string' as const, multiple_values: true, range_min: '', range_max: '', values: [{ value: 'kitchen', synonyms: ['кухня', 'на кухне'] }, { value: 'hall', synonyms: [] }] },
      { name: 'TEMP', description: '', type: 'number' as const, multiple_values: false, range_min: '15', range_max: '30', values: [] },
    ];
    expect(parseEntitiesCsv(entitiesToCsv(e))).toEqual(e);
  });
  it('неизвестный тип сущности становится строкой', () => {
    expect(parseEntitiesCsv('name;type\nX;bogus')[0].type).toBe('string');
  });
  it('интенты: фразы, паттерны, обязательные сущности, включён', () => {
    const i = [{ name: 'MUTE', enabled: false, comment: 'тихо', phrases: ['выключи звук', 'радио отключи'], patterns: ['* mute *'], entities: [{ name: 'ZONE', required: true }, { name: 'TEMP', required: false }] }];
    expect(parseIntentsCsv(intentsToCsv(i))).toEqual(i);
    expect(parseIntentsCsv('name\nX')[0].enabled).toBe(true);
  });
  it('файл без колонки name отклоняется', () => {
    expect(() => parseIntentsCsv('title\nX')).toThrow('name');
  });
});
