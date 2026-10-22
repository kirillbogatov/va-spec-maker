// Русский стеммер Snowball (без словарей): приводит слово к основе, чтобы «заказать», «заказал» и «заказали» совпадали.

const VOWELS = 'аеиоуыэюя';
const AYA = 'ая';

type Ending = [string, boolean?];
const list = (s: string, aya = false): Ending[] => s.split(' ').map((e) => [e, aya]);

const PERFECTIVE: Ending[] = [...list('в вши вшись', true), ...list('ив ивши ившись ыв ывши ывшись')];
const REFLEXIVE: Ending[] = list('ся сь');
const ADJECTIVE: Ending[] = list('ее ие ые ое ими ыми ей ий ый ой ем им ым ом его ого ему ому их ых ую юю ая яя ою ею');
const PARTICIPLE: Ending[] = [...list('ем нн вш ющ щ', true), ...list('ивш ывш ующ')];
const VERB: Ending[] = [
  ...list('ла на ете йте ли й л ем н ло но ет ют ны ть ешь нно', true),
  ...list('ила ыла ена ейте уйте ите или ыли ей уй ил ыл им ым ен ило ыло ено ят ует уют ит ыт ены ить ыть ишь ую ю'),
];
const NOUN: Ending[] = list('а ев ов ие ье е иями ями ами еи ии и ией ей ой ий й иям ям ием ем ам ом о у ах иях ях ы ь ю ию ью я');

/** Самое длинное окончание из списка; «а/я» перед ним обязательно для помеченных. */
function strip(s: string, endings: Ending[]): string | null {
  let best: string | null = null;
  for (const [e, needAYa] of endings) {
    if (!s.endsWith(e) || (best && best.length >= e.length)) continue;
    if (needAYa && !(s.length > e.length && AYA.includes(s[s.length - e.length - 1]))) continue;
    best = e;
  }
  return best === null ? null : s.slice(0, s.length - best.length);
}

/** Индекс начала области R1/R2: после первой согласной, следующей за гласной, начиная с `from`. */
function regionStart(w: string, from: number): number {
  for (let i = from + 1; i < w.length; i++) {
    if (!VOWELS.includes(w[i]) && VOWELS.includes(w[i - 1])) return i + 1;
  }
  return w.length;
}

export function stem(word: string): string {
  const w = word.toLowerCase().replace(/ё/g, 'е');
  if (!/^[а-я]+$/.test(w)) return w;
  const first = [...w].findIndex((c) => VOWELS.includes(c));
  if (first === -1) return w;
  const pre = w.slice(0, first + 1);
  let rv = w.slice(first + 1);
  const r2 = regionStart(w, regionStart(w, 0) - 1);

  // Шаг 1
  const gerund = strip(rv, PERFECTIVE);
  if (gerund !== null) rv = gerund;
  else {
    rv = strip(rv, REFLEXIVE) ?? rv;
    const adj = strip(rv, ADJECTIVE);
    if (adj !== null) rv = strip(adj, PARTICIPLE) ?? adj;
    else rv = strip(rv, VERB) ?? strip(rv, NOUN) ?? rv;
  }
  // Шаг 2
  if (rv.endsWith('и')) rv = rv.slice(0, -1);
  // Шаг 3: словообразовательные «ост»/«ость» только в R2
  for (const e of ['ость', 'ост']) {
    if (rv.endsWith(e) && pre.length + rv.length - e.length >= r2) {
      rv = rv.slice(0, -e.length);
      break;
    }
  }
  // Шаг 4
  if (rv.endsWith('ейше')) rv = rv.slice(0, -4);
  else if (rv.endsWith('ейш')) rv = rv.slice(0, -3);
  if (rv.endsWith('нн')) rv = rv.slice(0, -1);
  else if (rv.endsWith('ь')) rv = rv.slice(0, -1);
  return pre + rv;
}

/** Каждое русское слово текста заменяется основой; остальное (латиница, цифры, знаки) остаётся как есть. */
export function normalizeText(text: string): string {
  return text.replace(/[а-яё]+/gi, stem);
}

/** Ключ фразы для поиска дубликатов: без регистра и лишних пробелов, при `normalize` — ещё и по основам слов. */
export function phraseKey(p: string, normalize: boolean): string {
  const k = p.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalize ? normalizeText(k) : k;
}

/** Диапазоны [от, до) в `text`, где встречается любое из `words`; при `normalize` слова сравниваются по основам. */
export function findSlots(text: string, words: string[], normalize: boolean): [number, number][] {
  const ranges: [number, number][] = [];
  const lower = text.toLowerCase();
  for (const w of words) {
    const needle = w.toLowerCase();
    for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + needle.length)) ranges.push([i, i + needle.length]);
  }
  if (normalize) {
    const tokens = (s: string) => [...s.matchAll(/[а-яёa-z0-9]+/gi)].map((m) => ({ stem: stem(m[0]), start: m.index!, end: m.index! + m[0].length }));
    const textTokens = tokens(text);
    for (const w of words) {
      const wt = tokens(w).map((t) => t.stem);
      if (!wt.length) continue;
      for (let i = 0; i + wt.length <= textTokens.length; i++) {
        if (wt.every((s, j) => textTokens[i + j].stem === s)) ranges.push([textTokens[i].start, textTokens[i + wt.length - 1].end]);
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
