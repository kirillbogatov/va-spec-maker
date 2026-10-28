import { describe, expect, it } from 'vitest';
import { buildSchemeSvg, wrap, type SchemeInput } from './schemeSvg';

/** Каждый символ — 6 px: достаточно, чтобы проверить переносы без браузера. */
const measure = (text: string) => text.length * 6;
const style = { size: 10, fill: '#000' };

describe('wrap', () => {
  it('переносит по словам и режет слишком длинное слово (с запасом ширины)', () => {
    expect(wrap(measure, 'один два три', style, 52)).toEqual(['один два', 'три']);
    expect(wrap(measure, 'ABCDEFGHIJ', style, 32)).toEqual(['ABCDE', 'FGHIJ']);
    expect(wrap(measure, 'а\nб', style, 100)).toEqual(['а', 'б']);
  });

  it('ни одна строка не шире поля, текст не теряется и не заменяется многоточием', () => {
    const long = 'Проверить, что клиент авторизован, счёт не заблокирован и лимит_на_сегодня_ещё_не_исчерпан полностью';
    const lines = wrap(measure, long, style, 120);
    expect(lines.every((l) => measure(l) <= 120)).toBe(true);
    expect(lines.join('').replace(/\s/g, '')).toBe(long.replace(/\s/g, ''));
    expect(lines.join(' ')).not.toContain('…');
  });
});

describe('buildSchemeSvg', () => {
  const input: SchemeInput = {
    title: 'Перевод <по> номеру', subtitle: 'Вкладка «Основной»', date: '28.10.2026',
    states: [
      { name: 'VA_ACTIVATION', number: 1, tag: 'start', description: 'Старт', prompt: { name: 'P_HI', text: 'Привет' }, action: '' },
      { name: 'ST_DONE', number: 2, tag: 'end', description: '', prompt: null, action: 'Выполнить перевод' },
    ],
    edges: [{ id: 'e1', from: 'VA_ACTIVATION', to: 'ST_DONE', number: 1, intent: 'confirm', conds: ['amount>0'], mode: 'all', example: 'да' }],
    errors: [{ rule: 'Нет ответа', trigger: ['no_input', 'любое состояние'], prompt: null, action: '', targets: ['ST_DONE'] }],
    globals: [],
  };

  it('длинное описание состояния выводится целиком', async () => {
    const description = 'Очень длинное описание состояния, которое заведомо не помещается в одну строку блока и должно перенестись целиком без потерь';
    const svg = await buildSchemeSvg({ ...input, states: [{ ...input.states[0], description }, input.states[1]] }, measure);
    const text = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join(' ');
    for (const word of description.split(' ')) expect(text).toContain(word);
    expect(svg).not.toContain('…');
  });

  it('рисует блоки, карточку перехода и таблицу ошибок', async () => {
    const svg = await buildSchemeSvg(input, measure);
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('Перевод &lt;по&gt; номеру');
    expect(svg).toContain('VA_ACTIVATION');
    expect(svg).toContain('>E1<');
    expect(svg).toContain('УСЛОВИЯ · ВСЕ');
    expect(svg).toContain('«да»');
    expect(svg).toContain('ОШИБКИ СЦЕНАРИЯ');
    expect(svg).toContain('2 ST_DONE');
    expect(svg).toContain('marker-end="url(#ar)"');
    expect(svg).not.toContain('ГЛОБАЛЬНЫЕ ПЕРЕХОДЫ');
  });
});
