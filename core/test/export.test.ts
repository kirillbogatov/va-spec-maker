import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { request } from './request';
import { renderDocx } from '../src/export/docx';
import { renderMarkdown } from '../src/export/markdown';
import type { ProjectSpec } from '../src/export/model';
import { createProject, makeApp } from './helpers';
import { intentsTable } from '../src/export/tables';

const row = {
  state: 'ST_SEAT_HEATING', intent: 'INT_SEAT_HEATING', request_params: '', condition: 'Обогрев сидений выключен',
  prompt: 'PRM_SEAT_HEATING_ON', system_action: 'Включить обогрев', next_states: '',
};

const spec: ProjectSpec = {
  project: { id: 1, name: 'Обогрев', description: '' },
  intents: [
    {
      name: 'INT_SEAT_HEATING_SET',
      phrases: ['Обогрев сиденья на 3', 'Включи обогрев'],
      patterns: ['* (включи/включить) обогрев *'],
      entities: [{ name: 'seat_position', required: false }, { name: 'heating_level', required: true }],
    },
  ],
  entities: [
    {
      name: 'seat_position', type: 'string', range_min: '', range_max: '', multiple_values: true,
      values: [{ value: 'Driver', synonyms: ['водитель', 'левый'] }, { value: 'All', synonyms: [] }],
    },
    { name: 'heating_level', type: 'number', range_min: '1', range_max: '3', multiple_values: false, values: [] },
  ],
  scenario_entities: [{ scenario: 'Обогрев', name: 'seat_position', followup_prompt: 'Для какого сиденья включить обогрев?', required: true, is_array: false }],
  prompts: [
    { name: 'PRM_TEMPERATURE_SET', full_answers: ['Устанавливаю'] },
  ],
  dependencies: [{ scenario: 'Обогрев', name: 'seat_position', type: 'enum', values: ['Driver', 'All'] }],
  transitions: [row],
  errors: [{ ...row, state: 'DRIVER_ONLY', intent: null, request_params: "[seat position] = 'driver'", condition: '', prompt: null }],
};

describe('dependencies in export', () => {
  it('renders the dependencies table and structured conditions', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
    await request(app).put(`/api/scenarios/${sid}`).send({
      name: 'S',
      dependencies: [{ ref: 'a', name: 'Двигатель', type: 'bool' }],
      parts: [{ steps: [{ state: 'A', conditions: [{ dep: 'a', value: 'true' }], condition: 'ещё' }] }],
    });
    const md = (await request(app).get(`/api/scenarios/${sid}/export?format=md`)).text;
    expect(md).toContain('[Двигатель] = true<br>ещё');
  });
});

describe('renderMarkdown', () => {
  const md = renderMarkdown(spec, '2026-10-17');

  it('renders the sections in the L3 order', () => {
    const order = ['## Интенты', '## Сущности', '## Промпты', '## Переходы между состояниями', '## Ошибки'].map((h) => md.indexOf(h));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('shows phrase and pattern columns only for data present in the project', () => {
    const withIntent = (phrases: string[], patterns: string[]) =>
      renderMarkdown({ ...spec, intents: [{ ...spec.intents[0], phrases, patterns }] }, '2026-10-17');
    expect(withIntent(['a'], [])).toContain('| Интент | Фразы для обучения | Сущности |');
    expect(withIntent([], ['* a *'])).toContain('| Интент | Паттерны | Сущности |');
    expect(withIntent(['a'], ['* a *'])).toContain('| Интент | Фразы для обучения | Паттерны | Сущности |');
    expect(withIntent([], [])).toContain('| Интент | Фразы для обучения | Сущности |');
  });

  it('renders intents with numbered lists and required entities', () => {
    expect(md).toContain('| Интент | Фразы для обучения | Паттерны | Сущности |');
    expect(md).toContain('| INT_SEAT_HEATING_SET | 1. Обогрев сиденья на 3<br>2. Включи обогрев | 1. * (включи/включить) обогрев * | 1. [seat_position]<br>2. [heating_level] (обязательно) |');
    expect(md).toContain('| Из состояния | В состояние | Запрос пользователя | Условия | Действие системы | Ответ ассистента |');
    expect(md).not.toMatch(/Result code|Relative adjustment|\(required\)/);
  });

  it('renders entities, prompts, transitions and errors', () => {
    expect(md).toContain('| [seat_position] | Строка | • **Driver:** "водитель", "левый"<br>• **All** | да |');
    expect(md).toContain('| [heating_level] | Число<br>от 1 до 3 | - | нет |');
    expect(md).toContain('| да | Для какого сиденья включить обогрев? |');
    expect(md).not.toContain('## Scenario entities');
    expect(md).toContain('| PRM_TEMPERATURE_SET | 1. Устанавливаю |');
    expect(md).toContain('| ST_SEAT_HEATING | - | INT_SEAT_HEATING | Обогрев сидений выключен | Включить обогрев | PRM_SEAT_HEATING_ON |');
    expect(md).toContain("| DRIVER_ONLY | - | [seat position] = 'driver' | - | Включить обогрев | - |");
  });

  it('escapes pipes in table cells', () => {
    const s: ProjectSpec = { ...spec, transitions: [{ ...row, condition: 'a|b' }] };
    expect(renderMarkdown(s, 'd')).toContain('a\\|b');
  });
});

describe('renderDocx', () => {
  async function docXml(s: ProjectSpec) {
    const zip = await JSZip.loadAsync(await renderDocx(s, '2026-10-17'));
    return zip.file('word/document.xml')!.async('string');
  }

  it('produces the L3 tables (plus dependencies) in order on a landscape page', async () => {
    const xml = await docXml(spec);
    const pos = ['>Интенты<', '>Сущности<', '>Промпты<', '>Переходы между состояниями<', '>Ошибки<'].map((h) => xml.indexOf(h));
    expect(pos.every((n) => n >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(xml).toContain('w:orient="landscape"');
    expect(xml.match(/<w:tbl>/g)).toHaveLength(5);
  });

  it('numbers lists and renders example requests', async () => {
    const xml = await docXml(spec);
    for (const text of [
      'INT_SEAT_HEATING_SET', '1.\t[seat_position]', '2.\t[heating_level] (обязательно)',
      'Driver:', 'водитель&quot;, &quot;левый', 'DRIVER_ONLY',
    ]) {
      expect(xml).toContain(text);
    }
  });
});

describe('export route', () => {
  async function setup() {
    const { app, db } = await makeApp();
    const pid = createProject(db, 'Вампус');
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Сценарий' })).body.id as number;
    return { app, pid, sid };
  }

  it('returns markdown as an attachment', async () => {
    const { app, sid } = await setup();
    const res = await request(app).get(`/api/scenarios/${sid}/export?format=md`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('Сценарий')}.md`);
    expect(res.text).toContain('# Сценарий');
  });

  it('returns a docx file', async () => {
    const { app, sid } = await setup();
    const res = await request(app)
      .get(`/api/scenarios/${sid}/export?format=docx`);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('validates format and scenario', async () => {
    const { app, sid } = await setup();
    expect((await request(app).get(`/api/scenarios/${sid}/export?format=pdf`)).status).toBe(400);
    expect((await request(app).get('/api/scenarios/999/export?format=md')).status).toBe(404);
  });

  it('exports only the chosen scenario with what it references', async () => {
    const { app, pid, sid } = await setup();
    const mk = async (name: string) => (await request(app).post(`/api/projects/${pid}/intents`).send({ name })).body.id as number;
    const i = await mk('INT_PLAY');
    const other = await mk('INT_OTHER');
    for (const [id, name] of [[i, 'INT_PLAY'], [other, 'INT_OTHER']] as const) {
      await request(app).put(`/api/intents/${id}`).send({ name, phrases: [name] });
    }
    const pr = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM_OK' });
    const pr2 = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM_OTHER' });
    await request(app).put(`/api/scenarios/${sid}`).send({
      name: 'Сценарий',
      parts: [{
        steps: [{ kind: 'transition', state: 'ST_IDLE', intent_id: i, next_states: 'ST_PLAY' }],
        layout: { ST_PLAY: { x: 0, y: 0, prompt_id: pr.body.id, system_action: 'Играть' } },
      }],
    });
    const s2 = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Другой' })).body.id as number;
    await request(app).put(`/api/scenarios/${s2}`).send({
      name: 'Другой',
      parts: [{
        steps: [{ kind: 'transition', state: 'ST_OTHER', intent_id: other, next_states: 'ST_X' }],
        layout: { ST_X: { x: 0, y: 0, prompt_id: pr2.body.id } },
      }],
    });
    const res = await request(app).get(`/api/scenarios/${sid}/export?format=md`);
    expect(res.text).toContain('| INT_PLAY | 1. INT_PLAY |  |');
    expect(res.text).toContain('| ST_IDLE | ST_PLAY | INT_PLAY | - | Играть | PRM_OK |');
    expect(res.text).not.toContain('INT_OTHER');
    expect(res.text).not.toContain('PRM_OTHER');
    expect(res.text).not.toContain('ST_OTHER');
  });

  it('splits parts only inside the transitions section; other tables are shared', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Обогрев' })).body.id as number;
    await request(app).put(`/api/scenarios/${sid}`).send({
      name: 'Обогрев',
      parts: [
        { name: 'Включение', description: 'Как включить', steps: [{ state: 'ST_IDLE', next_states: 'ST_ON' }], layout: { ST_ON: { x: 0, y: 0, system_action: 'Включить' } } },
        { name: 'Выключение', steps: [{ state: 'ST_IDLE', next_states: 'ST_OFF' }], layout: { ST_OFF: { x: 0, y: 0, system_action: 'Выключить' } } },
      ],
    });
    const md = (await request(app).get(`/api/scenarios/${sid}/export?format=md`)).text;
    expect(md.match(/^# .*$/gm)).toEqual(['# Обогрев']);
    expect(md.match(/^## .*$/gm)).toEqual(['## Интенты', '## Сущности', '## Промпты', '## Переходы между состояниями', '## Ошибки']);
    expect(md.match(/^### .*$/gm)).toEqual(['### Включение', '### Выключение']);
    expect(md).toContain('Как включить');
    const [on, off] = md.split('### Выключение');
    expect(on).toContain('Включить');
    expect(on).not.toContain('Выключить');
    expect(off).toContain('Выключить');
    const docx = await request(app).get(`/api/scenarios/${sid}/export?format=docx`);
    const xml = await (await JSZip.loadAsync(docx.body)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Включение');
    expect(xml).toContain('Выключение');
  });
  it('lists connected intents even when unused and does not export global transitions as a section', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
    const cancel = (await request(app).post(`/api/scenarios/${sid}/intents`).send({ name: 'INT_CANCEL' })).body.id as number;
    await request(app).put(`/api/intents/${cancel}`).send({ name: 'INT_CANCEL', phrases: ['отмена'] });
    await request(app).post(`/api/scenarios/${sid}/intents`).send({ name: 'INT_SPARE' });
    await request(app).put(`/api/scenarios/${sid}/intents/${cancel}`).send({ is_global: true });
    const bye = (await request(app).post(`/api/scenarios/${sid}/prompts`).send({ name: 'PRM_BYE' })).body.id as number;
    await request(app).put(`/api/scenarios/${sid}`).send({
      name: 'S',
      parts: [{
        steps: [
          { kind: 'transition', state: 'ST_A', next_states: 'ST_B' },
          { kind: 'global', intent_id: cancel, condition: 'всегда', next_states: 'ST_END' },
          { kind: 'error', state: 'ST_A', condition: 'сбой' },
        ],
        layout: { ST_END: { x: 0, y: 0, prompt_id: bye, system_action: 'Сбросить' } },
      }],
    });
    const md = (await request(app).get(`/api/scenarios/${sid}/export?format=md`)).text;
    expect(md.match(/^## .*$/gm)).toEqual(['## Интенты', '## Сущности', '## Промпты', '## Переходы между состояниями', '## Ошибки']);
    expect(md).toContain('| В состояние | Запрос пользователя | Условия | Действие системы | Ответ ассистента |');
    expect(md).not.toContain('Глобальные переходы');
    expect(md).toContain('| INT_SPARE |');
    const [, afterTransitions] = md.split('## Переходы между состояниями');
    expect(afterTransitions).not.toContain('ST_END');
    expect(afterTransitions).toContain('Любой интент сценария');
    const docx = await request(app).get(`/api/scenarios/${sid}/export?format=docx`);
    const xml = await (await JSZip.loadAsync(docx.body)).file('word/document.xml')!.async('string');
    expect(xml).not.toContain('Глобальные переходы');
  });

  it('does not export an intent that is not connected to the scenario', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
    await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'INT_LOOSE' });
    const md = (await request(app).get(`/api/scenarios/${sid}/export?format=md`)).text;
    expect(md).not.toContain('INT_LOOSE');
  });
});

describe('spec language', () => {
  it('translates fixed texts to English and keeps user input', () => {
    const md = renderMarkdown(spec, '2026-10-17', 'en');
    for (const h of ['## Intents', '## Entities', '## Prompts', '## State transitions', '## Errors', 'Specification dated 2026-10-17', 'Training phrases', '(required)', 'Number', 'from 1 to 3', 'Multiple values']) {
      expect(md).toContain(h);
    }
    expect(md).not.toContain('## Интенты');
    expect(md).toContain('Обогрев сиденья на 3');
    expect(md).toContain('INT_SEAT_HEATING_SET');
  });

  it('serves English preview and export by the lang parameter', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
    expect((await request(app).get(`/api/scenarios/${sid}/preview?lang=en`)).text).toContain('## Intents');
    expect((await request(app).get(`/api/scenarios/${sid}/preview`)).text).toContain('## Интенты');
    expect((await request(app).get(`/api/projects/${pid}/export?format=md&lang=en`)).text).toContain('## State transitions');
  });
});

describe('intents table in keywords mode', () => {
  const base = spec.intents[0];
  it('выводит колонки Intent | Keywords | Example phrases | Entities с общей нумерацией', () => {
    const s: ProjectSpec = { ...spec, intentMode: 'keywords', intents: [{ ...base, phrases: ['включи обогрев', 'привет'], patterns: ['* x *'], keywords: [['SET', 'HEATING'], []] }] };
    const t = intentsTable(s, 'en');
    expect(t.head).toEqual(['Intent', 'Keywords', 'Example phrases', 'Entities']);
    expect(t.rows[0].cells[1]).toEqual({ list: ['SET, HEATING', '-'] });
    expect(t.rows[0].cells[2]).toEqual({ list: ['включи обогрев', 'привет'] });
    expect(t.widths.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('через API: preview считает ключевые слова из справочника', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    await request(app).post(`/api/projects/${pid}/keywords/import`).send({ text: 'OFF: выключить\nSOUND: звук\n' });
    const sc = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Громкость' });
    const it = await request(app).post(`/api/scenarios/${sc.body.id}/intents`).send({ name: 'MUTE' });
    await request(app).put(`/api/intents/${it.body.id}`).send({ name: 'MUTE', comment: '', enabled: true, values: [{ text: 'выключи звук', kind: 'phrase' }], entities: [] });
    const md = await request(app).get(`/api/scenarios/${sc.body.id}/preview?lang=en&intentMode=keywords`);
    expect(md.text).toContain('Keywords');
    expect(md.text).toContain('OFF, SOUND');
  });
});
