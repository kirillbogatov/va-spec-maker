import type { EntityValue } from './types';

export function parsePhrases(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function splitTags(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseBulkValues(text: string): EntityValue[] {
  return parsePhrases(text)
    .map((line) => {
      const i = line.indexOf(':');
      if (i === -1) return { value: line, synonyms: [] };
      return { value: line.slice(0, i).trim(), synonyms: splitTags(line.slice(i + 1)) };
    })
    .filter((v) => v.value);
}
