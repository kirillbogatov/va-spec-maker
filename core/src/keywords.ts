import { stem } from './stem';

export interface KeywordDef { name: string; synonyms: string[] }

const tokens = (s: string): { stem: string; start: number }[] =>
  [...s.matchAll(/[а-яёa-z0-9]+/gi)].map((m) => ({ stem: stem(m[0]), start: m.index! }));

/** Ключевые слова, чьи код или синонимы встречаются во фразе (по основам слов); порядок — по первому появлению, без повторов. */
export function matchKeywords(phrase: string, keywords: KeywordDef[]): string[] {
  const text = tokens(phrase);
  if (!text.length) return [];
  const found: { name: string; at: number }[] = [];
  for (const k of keywords) {
    let at = -1;
    for (const term of [k.name, ...k.synonyms]) {
      const t = tokens(term).map((x) => x.stem);
      if (!t.length) continue;
      for (let i = 0; i + t.length <= text.length; i++) {
        if (t.every((s, j) => text[i + j].stem === s)) {
          if (at === -1 || text[i].start < at) at = text[i].start;
          break;
        }
      }
    }
    if (at !== -1) found.push({ name: k.name, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}
