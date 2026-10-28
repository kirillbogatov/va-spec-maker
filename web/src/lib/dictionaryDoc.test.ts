import { describe, expect, it } from 'vitest';
import { renderTableDocx } from '@va/core';
import { tableToTxt } from './dictionaryDoc';

const table = {
  head: ['Интент', 'Комментарий', 'Фразы', 'Сущности'],
  widths: [25, 25, 25, 25],
  rows: [
    { cells: [{ text: ['INT_OFF'] }, { text: ['выключение'] }, { list: ['выключи', 'стоп'] }, { list: [] }] },
    { cells: [{ text: ['INT_ON'] }, { text: [] }, { list: ['включи'] }, { bullets: [{ bold: 'ROOM:', text: '«кухня»' }] }] },
  ],
};

describe('tableToTxt', () => {
  it('блок на объект: название, затем непустые колонки; списки — с отступом', () => {
    expect(tableToTxt('Интенты', table)).toBe([
      'Интенты (2)', '',
      'INT_OFF', '  Комментарий: выключение', '  Фразы:', '    1. выключи', '    2. стоп', '',
      'INT_ON', '  Фразы:', '    1. включи', '  Сущности:', '    • ROOM: «кухня»', '',
    ].join('\n'));
  });
});

describe('renderTableDocx', () => {
  it('собирает docx (zip) с таблицей', async () => {
    const blob = await renderTableDocx('Интенты', table);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  });
});
