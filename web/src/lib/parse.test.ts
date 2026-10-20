import { describe, expect, it } from 'vitest';
import { parseBulkValues, parsePhrases, splitTags } from './parse';

describe('parsePhrases', () => {
  it('splits lines, trims and drops empty ones', () => {
    expect(parsePhrases(' a \r\n\n* (b/c) d* *\n')).toEqual(['a', '* (b/c) d* *']);
  });
});

describe('splitTags', () => {
  it('splits by comma and trims', () => {
    expect(splitTags(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseBulkValues', () => {
  it('parses "value: syn1, syn2" lines', () => {
    expect(parseBulkValues('красавчик: молодец, умница\nумница\n: мусор')).toEqual([
      { value: 'красавчик', synonyms: ['молодец', 'умница'] },
      { value: 'умница', synonyms: [] },
    ]);
  });
});
