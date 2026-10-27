# Режим «Ключевые слова» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить справочник «Ключевые слова» (код + синонимы, импорт/экспорт txt) и четвёртый режим описания интентов «Ключевые слова», где колонка ключевых слов у фразы вычисляется автоматически; отразить режим в UI и в экспорте.

**Architecture:** Стеммер и функция сопоставления `matchKeywords` живут в `core` и экспортируются из `@va/core`; web использует их же, поэтому UI и экспорт считают одинаково. Справочник — новая таблица `keywords` и маршруты по образцу `dependency-dictionary`. Режим — ещё одно значение `IntentMode` (localStorage), колонка в UI только для чтения, в экспорте — колонка в `intentsTable`.

**Tech Stack:** TypeScript (ESM), npm workspaces `core` (vitest, самописный роутер, SQLite) и `web` (React, Vite, TanStack Query, shadcn-стиль).

## Global Constraints

- Весь текст интерфейса — на русском; в UI вместо «концепт» везде «ключевые слова».
- Код ключевого слова хранится без `$`; в UI показывается как `$КОД`; ведущий `$` при вводе и импорте отбрасывается.
- Сопоставление — по основе слова (`stem`), регистр не важен, `ё` = `е`; код ключевого слова тоже считается синонимом.
- Колонка ключевых слов только для чтения, в БД не хранится.
- Формат txt: строка `КОД: синоним1, синоним2`; пустые строки и строки с `#` в начале игнорируются; дубли кодов в файле — побеждает последняя строка.
- Экспорт, режим `keywords`: колонки `Intent | Keywords | Example phrases | Entities`; фраза без ключевых слов даёт «-».
- Не менять поведение режимов `phrases`/`patterns`/`both`; существующие тесты остаются зелёными.
- Команды запускать из корня `V:\Claude\VA Spec Maker`: `npm test -w core`, `npm run typecheck -w core`, `npx tsc --noEmit -p web` (если у web другой скрипт проверки типов — использовать его из `web/package.json`).

---

### Task 1: Перенос стеммера в core и `matchKeywords`

**Files:**
- Move: `web/src/lib/stem.ts` → `core/src/stem.ts`; `web/src/lib/stem.test.ts` → `core/test/stem.test.ts`
- Create: `web/src/lib/stem.ts` (реэкспорт), `core/src/keywords.ts`, `core/test/keywords.test.ts`
- Modify: `core/src/index.ts`

**Interfaces:**
- Produces (`core/src/keywords.ts`): `interface KeywordDef { name: string; synonyms: string[] }`; `matchKeywords(phrase: string, keywords: KeywordDef[]): string[]` — имена найденных ключевых слов в порядке первого появления во фразе, без повторов.
- Produces (`@va/core`): `stem`, `normalizeText`, `phraseKey`, `findSlotMatches`, `findSlots`, тип `SlotMatch`, `matchKeywords`, тип `KeywordDef`.

- [ ] **Step 1: Перенести стеммер**

```bash
git mv web/src/lib/stem.ts core/src/stem.ts
git mv web/src/lib/stem.test.ts core/test/stem.test.ts
```
В `core/test/stem.test.ts` заменить `from './stem'` на `from '../src/stem'`.

- [ ] **Step 2: Оставить в web тонкую обёртку**

Создать `web/src/lib/stem.ts`:
```ts
export { stem, normalizeText, phraseKey, findSlotMatches, findSlots } from '@va/core';
export type { SlotMatch } from '@va/core';
```

- [ ] **Step 3: Написать падающий тест `core/test/keywords.test.ts`**

```ts
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
```

- [ ] **Step 4: Запустить, убедиться, что падает**

Run: `npm test -w core -- keywords`
Expected: FAIL — `Cannot find module '../src/keywords'`.

- [ ] **Step 5: Реализовать `core/src/keywords.ts`**

```ts
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
```

- [ ] **Step 6: Экспортировать из `core/src/index.ts`** (добавить строки)

```ts
export { stem, normalizeText, phraseKey, findSlotMatches, findSlots } from './stem';
export type { SlotMatch } from './stem';
export { matchKeywords } from './keywords';
export type { KeywordDef } from './keywords';
```

- [ ] **Step 7: Прогнать тесты и типы**

Run: `npm test -w core && npm run typecheck -w core`
Expected: PASS (включая перенесённый `stem.test.ts`).
Run: `npm test -w web`
Expected: PASS (остальные web-тесты не зависят от `stem`).

- [ ] **Step 8: Commit**

```bash
git add -A core web
git commit -m "feat: сопоставление ключевых слов, стеммер перенесён в core"
```

---

### Task 2: Разбор и сборка txt справочника

**Files:**
- Modify: `core/src/keywords.ts`
- Test: `core/test/keywords.test.ts`

**Interfaces:**
- Produces: `cleanKeywordName(v: string): string` (trim, убирает ведущие `$`, схлопывает пробелы); `parseKeywordsTxt(text: string): { items: KeywordDef[]; skipped: number }`; `keywordsToTxt(items: KeywordDef[]): string`.

- [ ] **Step 1: Добавить падающие тесты в `core/test/keywords.test.ts`** (импорт расширить: `cleanKeywordName, keywordsToTxt, parseKeywordsTxt`)

```ts
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
```
Примечание к первому тесту: дубль `OFF` — побеждает последняя строка, но позиция остаётся по последнему появлению (элемент `OFF` оказывается после `BARE`); строка `: без кода` считается пропущенной.

- [ ] **Step 2: Запустить — падает**

Run: `npm test -w core -- keywords`
Expected: FAIL — функции не экспортированы.

- [ ] **Step 3: Реализовать в `core/src/keywords.ts`**

```ts
export const cleanKeywordName = (v: string): string => v.replace(/^[\s$]+/, '').replace(/\s+/g, ' ').trim();

/** Синонимы: без пустых и повторов (без учёта регистра), порядок сохраняется. */
export function cleanSynonyms(list: string[]): string[] {
  const seen = new Set<string>();
  return list.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && !!seen.add(s.toLowerCase()));
}

/** Разбор txt: «КОД: синоним1, синоним2» по строке; пустые и «#…» пропускаются, строка без кода — в skipped, при дубле кода побеждает последняя. */
export function parseKeywordsTxt(text: string): { items: KeywordDef[]; skipped: number } {
  const byName = new Map<string, KeywordDef>();
  let skipped = 0;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    const name = cleanKeywordName(i === -1 ? line : line.slice(0, i));
    if (!name) { skipped++; continue; }
    const synonyms = cleanSynonyms(i === -1 ? [] : line.slice(i + 1).split(','));
    const key = name.toLowerCase();
    byName.delete(key);
    byName.set(key, { name, synonyms });
  }
  return { items: [...byName.values()], skipped };
}

export function keywordsToTxt(items: KeywordDef[]): string {
  return items.map((k) => `${k.name}:${k.synonyms.length ? ' ' + k.synonyms.join(', ') : ''}\n`).join('');
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npm test -w core -- keywords`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core && git commit -m "feat: разбор и сборка txt справочника ключевых слов"
```

---

### Task 3: Таблица, дамп и маршруты справочника

**Files:**
- Modify: `core/src/db.ts` (после `dependency_dictionary`, ~строка 71), `core/src/project-dump.ts:55`, `core/src/app.ts`
- Create: `core/src/routes/keywords.ts`, `core/test/keywords-routes.test.ts`

**Interfaces:**
- Consumes: `cleanKeywordName`, `cleanSynonyms`, `parseKeywordsTxt`, `keywordsToTxt` (Task 2).
- Produces API:
  - `GET /api/projects/:pid/keywords` → `{ id, project_id, name, synonyms: string[], used_by: [] }[]` (по алфавиту, без учёта регистра)
  - `POST /api/projects/:pid/keywords` `{ name }` → 201 (409 `duplicate` при совпадении без учёта регистра)
  - `GET /api/keywords/:id`, `PUT /api/keywords/:id` `{ name, synonyms }`, `DELETE /api/keywords/:id` → 204
  - `GET /api/projects/:pid/keywords/export` → text/plain, `Content-Disposition: attachment; filename*=UTF-8''keywords.txt`
  - `POST /api/projects/:pid/keywords/import` `{ text }` → `{ added, updated, skipped }`

- [ ] **Step 1: Падающий тест `core/test/keywords-routes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { request } from './request';
import { createProject, makeApp } from './helpers';
import { dumpProject, importProject } from '../src';

describe('keywords dictionary', () => {
  it('создаёт, правит, отклоняет дубли без учёта регистра и удаляет', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const c = await request(app).post(`/api/projects/${pid}/keywords`).send({ name: '$OFF' });
    expect(c.status).toBe(201);
    expect(c.body.name).toBe('OFF');
    const put = await request(app).put(`/api/keywords/${c.body.id}`).send({ name: 'OFF', synonyms: [' выключи ', 'Выключи', '', 'отключи'] });
    expect(put.body).toMatchObject({ name: 'OFF', synonyms: ['выключи', 'отключи'], used_by: [] });
    expect((await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'off' })).status).toBe(409);
    const other = await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'SOUND' });
    expect((await request(app).put(`/api/keywords/${other.body.id}`).send({ name: 'Off', synonyms: [] })).status).toBe(409);
    expect((await request(app).get(`/api/projects/${pid}/keywords`)).body.map((k: { name: string }) => k.name)).toEqual(['OFF', 'SOUND']);
    expect((await request(app).delete(`/api/keywords/${c.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/keywords/${c.body.id}`)).status).toBe(404);
  });

  it('экспортирует и импортирует txt: обновляет существующие, добавляет новые', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const a = await request(app).post(`/api/projects/${pid}/keywords`).send({ name: 'OFF' });
    await request(app).put(`/api/keywords/${a.body.id}`).send({ name: 'OFF', synonyms: ['старый'] });
    const r = await request(app).post(`/api/projects/${pid}/keywords/import`).send({ text: 'off: выключи, отключи\nSOUND: звук\n: плохая\n' });
    expect(r.body).toEqual({ added: 1, updated: 1, skipped: 1 });
    const exp = await request(app).get(`/api/projects/${pid}/keywords/export`);
    expect(exp.headers['content-disposition']).toContain("filename*=UTF-8''keywords.txt");
    expect(exp.body).toBe('OFF: выключи, отключи\nSOUND: звук\n');
  });

  it('входит в дамп и восстановление проекта', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    await request(app).post(`/api/projects/${pid}/keywords/import`).send({ text: 'OFF: выключи\n' });
    const copy = importProject(db, dumpProject(db, pid));
    const list = await request(app).get(`/api/projects/${copy}/keywords`);
    expect(list.body.map((k: { name: string; synonyms: string[] }) => [k.name, k.synonyms])).toEqual([['OFF', ['выключи']]]);
  });
});
```
Перед запуском проверить сигнатуры `dumpProject`/`importProject` в `core/src/project-dump.ts` и подогнать вызов (возвращаемое значение `importProject` — id нового проекта; если возвращается объект, взять из него id).

- [ ] **Step 2: Запустить — падает**

Run: `npm test -w core -- keywords-routes`
Expected: FAIL (маршруты 404).

- [ ] **Step 3: Таблица в `core/src/db.ts`** — после блока `dependency_dictionary`:

```sql
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  synonyms TEXT NOT NULL DEFAULT '[]',
  UNIQUE (project_id, name)
);
```

- [ ] **Step 4: Дамп** — в `TABLES` в `core/src/project-dump.ts` после `dependency_dictionary`:

```ts
  { name: 'keywords', where: IN_PROJECT, fk: {} },
```

- [ ] **Step 5: Маршруты `core/src/routes/keywords.ts`**

```ts
import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { HttpError, notFound } from '../errors';
import { cleanKeywordName, cleanSynonyms, keywordsToTxt, parseKeywordsTxt } from '../keywords';
import { optString, parseId, requireString } from '../validate';

interface Row { id: number; project_id: number; name: string; synonyms: string }

const view = (r: Row) => ({ id: r.id, project_id: r.project_id, name: r.name, synonyms: JSON.parse(r.synonyms) as string[], used_by: [] as { id: number; name: string }[] });

/** Справочник ключевых слов проекта: код и синонимы. Фразам интентов ключевые слова подбираются по тексту, привязок нет. */
export function keywordsRouter(db: Db): RouterT {
  const r = Router();

  const all = (pid: number) =>
    (db.prepare('SELECT id, project_id, name, synonyms FROM keywords WHERE project_id = ?').all(pid) as Row[]).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  const load = (id: number): Row => {
    const k = db.prepare('SELECT id, project_id, name, synonyms FROM keywords WHERE id = ?').get(id) as Row | undefined;
    if (!k) throw notFound('Ключевое слово');
    return k;
  };
  const assertUnique = (pid: number, name: string, exceptId?: number) => {
    const key = name.toLowerCase();
    if (all(pid).some((k) => k.id !== exceptId && k.name.toLowerCase() === key)) {
      throw new HttpError(409, 'duplicate', `Ключевое слово «${name}» уже существует`);
    }
  };
  const cleanName = (v: unknown) => {
    const name = cleanKeywordName(requireString(v, 'Код'));
    if (!name) throw new HttpError(400, 'bad_request', 'Поле «Код» не может быть пустым');
    return name;
  };
  const requireProject = (pid: number) => {
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
  };

  r.get('/projects/:pid/keywords', (req, res) => {
    res.json(all(parseId(req.params.pid)).map(view));
  });

  r.post('/projects/:pid/keywords', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = cleanName(req.body?.name);
    requireProject(pid);
    assertUnique(pid, name);
    const info = db.prepare('INSERT INTO keywords(project_id, name) VALUES (?, ?)').run(pid, name);
    res.status(201).json(view(load(Number(info.lastInsertRowid))));
  });

  r.get('/projects/:pid/keywords/export', (req, res) => {
    const items = all(parseId(req.params.pid)).map((k) => ({ name: k.name, synonyms: JSON.parse(k.synonyms) as string[] }));
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''keywords.txt");
    res.type('text/plain; charset=utf-8').send(keywordsToTxt(items));
  });

  r.post('/projects/:pid/keywords/import', (req, res) => {
    const pid = parseId(req.params.pid);
    requireProject(pid);
    const { items, skipped } = parseKeywordsTxt(optString(req.body?.text));
    const existing = new Map(all(pid).map((k) => [k.name.toLowerCase(), k.id]));
    let added = 0;
    let updated = 0;
    db.transaction(() => {
      for (const k of items) {
        const id = existing.get(k.name.toLowerCase());
        if (id === undefined) {
          db.prepare('INSERT INTO keywords(project_id, name, synonyms) VALUES (?, ?, ?)').run(pid, k.name, JSON.stringify(k.synonyms));
          added++;
        } else {
          db.prepare('UPDATE keywords SET synonyms = ? WHERE id = ?').run(JSON.stringify(k.synonyms), id);
          updated++;
        }
      }
    })();
    res.json({ added, updated, skipped });
  });

  r.get('/keywords/:id', (req, res) => {
    res.json(view(load(parseId(req.params.id))));
  });

  r.put('/keywords/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const name = cleanName(req.body?.name);
    assertUnique(cur.project_id, name, id);
    const synonyms = cleanSynonyms(Array.isArray(req.body?.synonyms) ? req.body.synonyms.map(optString) : []);
    db.prepare('UPDATE keywords SET name = ?, synonyms = ? WHERE id = ?').run(name, JSON.stringify(synonyms), id);
    res.json(view(load(id)));
  });

  r.delete('/keywords/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
```
Если `body` в `Req` не типизирован как `any`, привести `req.body?.synonyms` к `unknown[]` по образцу `cleanValues` в `dependency-dictionary.ts`.

- [ ] **Step 6: Подключить в `core/src/app.ts`**: `import { keywordsRouter } from './routes/keywords';` и добавить `keywordsRouter(db)` в массив `routers` после `dependencyDictionaryRouter(db)`.

- [ ] **Step 7: Запустить — проходит**

Run: `npm test -w core && npm run typecheck -w core`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add core && git commit -m "feat: справочник ключевых слов (таблица, маршруты, импорт/экспорт txt)"
```

---

### Task 4: Экспорт и предпросмотр

**Files:**
- Modify: `core/src/export/model.ts`, `core/src/export/tables.ts`, `core/src/export/i18n.ts`
- Test: `core/test/export.test.ts`

**Interfaces:**
- Consumes: `matchKeywords` (Task 1), таблица `keywords` (Task 3).
- Produces: `IntentMode` включает `'keywords'`; `ProjectSpec.intents[].keywords?: string[][]` (по фразе); `SpecStrings.keywordsHead: string`.

- [ ] **Step 1: Падающие тесты в `core/test/export.test.ts`** (в конец файла; импорт `intentsTable` из `../src/export/tables`)

```ts
import { intentsTable } from '../src/export/tables';

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
    expect(md.body).toContain('Keywords');
    expect(md.body).toContain('OFF, SOUND');
  });
});
```
Перед запуском свериться с телом `PUT /intents/:id` (`core/src/routes/intents.ts:126-165`) и подогнать обязательные поля.

- [ ] **Step 2: Запустить — падает**

Run: `npm test -w core -- export`
Expected: FAIL.

- [ ] **Step 3: `model.ts`**
  - `export type IntentMode = 'phrases' | 'patterns' | 'both' | 'keywords';`
  - `parseIntentMode`: `(v === 'phrases' || v === 'patterns' || v === 'keywords' ? v : 'both')`.
  - В `ProjectSpec.intents[]` добавить `/** Ключевые слова каждой фразы (по порядку фраз). */ keywords?: string[][];`.
  - В начале `buildSpec` загрузить справочник и импортировать `matchKeywords`:

```ts
import { matchKeywords } from '../keywords';
// ...
const keywordDefs = (db.prepare('SELECT name, synonyms FROM keywords WHERE project_id = ? ORDER BY id').all(projectId) as { name: string; synonyms: string }[]).map((k) => ({ name: k.name, synonyms: JSON.parse(k.synonyms) as string[] }));
```
  - В `.map((i) => ({ ... }))` интентов вынести фразы в переменную и добавить поле: заменить строку `phrases: (db.prepare(...)).map((p) => p.text),` на вычисление через промежуточное `const phrases = ...`, т.е. превратить стрелочную функцию `.map((i) => ({` в `.map((i) => { const phrases = ...; return { name: i.name, phrases, keywords: phrases.map((p) => matchKeywords(p, keywordDefs)), patterns: ..., entities: ... }; })` — остальные поля не менять.

- [ ] **Step 4: `i18n.ts`** — в интерфейс `SpecStrings` добавить `keywordsHead: string;`, в `ru`: `keywordsHead: 'Ключевые слова',`, в `en`: `keywordsHead: 'Keywords',` (рядом с `intentsHead`). Для режима `keywords` заголовок фраз в en — «Example phrases», в ru — «Фразы для обучения» (как в `intentsHead[1]`): добавить `examplePhrasesHead: string;` со значениями `'Фразы для обучения'` и `'Example phrases'`.

- [ ] **Step 5: `tables.ts`** — в начале `intentsTable` после `const mode = ...`:

```ts
  if (mode === 'keywords') {
    return {
      head: [nameHead, STRINGS[lang].keywordsHead, STRINGS[lang].examplePhrasesHead, entitiesHead],
      widths: [18, 20, 40, 22],
      rows: spec.intents.map((i): Row => ({
        cells: [
          text(i.name),
          list(i.phrases.map((_, n) => (i.keywords?.[n]?.length ? i.keywords[n].join(', ') : '-'))),
          list(i.phrases),
          list(i.entities.map((e) => ref(e.name) + (e.required ? ` (${STRINGS[lang].required})` : ''))),
        ],
      })),
    };
  }
```

- [ ] **Step 6: Запустить — проходит**

Run: `npm test -w core && npm run typecheck -w core`
Expected: PASS (старые тесты `withIntent(...)` для `phrases/patterns/both` не меняются).

- [ ] **Step 7: Commit**

```bash
git add core && git commit -m "feat: колонка ключевых слов в экспорте и предпросмотре"
```

---

### Task 5: Режим в web: типы, API, настройка

**Files:**
- Modify: `web/src/lib/intentMode.ts`, `web/src/lib/types.ts`, `web/src/lib/api.ts`
- Create: `web/src/lib/keywords.ts`
- Modify (проверить, нужна ли правка): `web/src/pages/settings/SettingsPage.tsx` (список строится из `INTENT_MODES`, правка не нужна; поправить описание под радио-группой)

**Interfaces:**
- Produces: `IntentMode` = `'phrases'|'patterns'|'both'|'keywords'`; `type Keyword = { id: number; project_id: number; name: string; synonyms: string[]; used_by: { id: number; name: string }[] }`; `api.keywords.{list,get,create,save,remove,import,exportTxt}`; `useKeywords(projectId): Keyword[]`; `useKeywordMatcher(projectId): (phrase: string) => string[]`.

- [ ] **Step 1: `intentMode.ts`**
  - Тип: `'phrases' | 'patterns' | 'both' | 'keywords'`; в `INTENT_MODES` добавить `{ value: 'keywords', label: 'Фразы + ключевые слова' }`.
  - `MODE_TITLE`: `keywords: 'Ключевые слова'`; `MODE_EMPTY`: `keywords: 'нет фраз'`.
  - `modeShows`: `mode === 'both' || (mode === 'patterns' ? kind === 'pattern' : kind === 'phrase')`.
  - `readIntentMode`: `v === 'patterns' || v === 'both' || v === 'keywords' ? v : 'phrases'`.
  - `modeKind` не меняется (для `keywords` вернёт `'phrase'`).

- [ ] **Step 2: `types.ts`** — после `DictionaryDependency`:

```ts
export interface Keyword { id: number; project_id: number; name: string; synonyms: string[]; used_by: { id: number; name: string }[] }
```

- [ ] **Step 3: `api.ts`** — импортировать `Keyword` и добавить после `dependencyDictionary`:

```ts
  keywords: {
    list: (pid: number) => req<Keyword[]>('GET', `/api/projects/${pid}/keywords`),
    create: (pid: number, name: string) => req<Keyword>('POST', `/api/projects/${pid}/keywords`, { name }),
    save: (id: number, body: { name: string; synonyms: string[] }) => req<Keyword>('PUT', `/api/keywords/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/keywords/${id}`),
    import: (pid: number, text: string) => req<{ added: number; updated: number; skipped: number }>('POST', `/api/projects/${pid}/keywords/import`, { text }),
    exportTxt: (pid: number) => api.exportFile(`/api/projects/${pid}/keywords/export`, 'keywords.txt'),
  },
```
(если `api` — объявление через `export const api = {...}` и самоссылка внутри невозможна, использовать `exportFile` через локальную функцию, которую `api.exportFile` уже оборачивает: `async (pid: number) => downloadResponse(await request('GET', ...), 'keywords.txt')`, как это сделано в `exportFile`.)

- [ ] **Step 4: `web/src/lib/keywords.ts`**

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { matchKeywords } from '@va/core';
import { api } from './api';
import type { Keyword } from './types';

/** Ключевые слова в UI показываются с префиксом «$»; в данных кода его нет. */
export const keywordLabel = (name: string) => `$${name}`;

export function useKeywords(projectId: number): Keyword[] {
  return useQuery({ queryKey: ['keywords', projectId], queryFn: () => api.keywords.list(projectId) }).data ?? [];
}

/** Функция «фраза → коды ключевых слов» по справочнику проекта. */
export function useKeywordMatcher(projectId: number): (phrase: string) => string[] {
  const keywords = useKeywords(projectId);
  return useMemo(() => (phrase: string) => matchKeywords(phrase, keywords), [keywords]);
}
```

- [ ] **Step 5: Описание в `SettingsPage.tsx`** — к абзацу под «Как описывать интенты» добавить: «Ключевые слова — фразы, к которым автоматически подбираются слова из справочника «Ключевые слова».»

- [ ] **Step 6: Проверка типов**

Run: `npx tsc --noEmit -p web` (или скрипт из `web/package.json`)
Expected: ошибки только в `Record<ObjectKind, …>`-местах, если они появятся позже; на этом шаге — чисто.

- [ ] **Step 7: Commit**

```bash
git add web && git commit -m "feat: режим «Ключевые слова» в настройках, API и хуки web"
```

---

### Task 6: Страница справочника «Ключевые слова»

**Files:**
- Create: `web/src/pages/keywords/KeywordsPage.tsx`, `web/src/components/KeywordChips.tsx`
- Modify: `web/src/components/TypeToken.tsx`, `web/src/components/DictionaryMaster.tsx`, `web/src/components/AppShell.tsx`, `web/src/components/CommandPalette.tsx`, `web/src/App.tsx`, `web/src/index.css`

**Interfaces:**
- Consumes: `api.keywords`, `useKeywords`, `keywordLabel` (Task 5).
- Produces: `ObjectKind` включает `'keyword'`; `DictionaryMaster` принимает `listActions?: ReactNode`; `<KeywordChips names={string[]} placeholder?: string />`.

- [ ] **Step 1: Цвета в `index.css`** — рядом с каждым определением `--dep`/`--dep-bg` и с `--color-dep*` добавить (найти через `grep -n "dep" web/src/index.css`):
  - маппинг: `--color-kw: var(--kw);` `--color-kw-bg: var(--kw-bg);`
  - светлая тема: `--kw: #1f7a3d; --kw-bg: #e3f4e0;`
  - тёмная тема (каждый блок, где есть `--dep-bg`): `--kw: #8fd6a0; --kw-bg: #1d3a27;`

- [ ] **Step 2: `TypeToken.tsx`** — `ObjectKind` + `'keyword'`; `TONE.keyword = 'bg-kw-bg text-kw'`; `DOT.keyword = 'bg-kw'`; `KIND_LABEL.keyword = 'Ключевое слово'`. В `DictionaryMaster.tsx`: `CHIP.keyword = 'bg-kw-bg text-kw'`, `SEARCH_WHERE.keyword = 'ключевых словах'`; в `Props` добавить `/** Кнопки над списком (например, импорт/экспорт). */ listActions?: ReactNode;`, а под `{p.onCreate && <ListHeader .../>}` вставить:

```tsx
          {p.listActions && <div className="flex flex-wrap items-center justify-end gap-1 border-b px-3 py-1.5">{p.listActions}</div>}
```

- [ ] **Step 3: `KeywordChips.tsx`**

```tsx
import { TypeToken } from '@/components/TypeToken';
import { keywordLabel } from '@/lib/keywords';

/** Ключевые слова фразы чипами через запятую; без совпадений — приглушённая подсказка. */
export function KeywordChips({ names, placeholder }: { names: string[]; placeholder?: string }) {
  if (!names.length) return placeholder ? <span className="text-sm text-muted-foreground">{placeholder}</span> : null;
  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {names.map((n, i) => (
        <span key={n} className="inline-flex items-center">
          <TypeToken kind="keyword">{keywordLabel(n)}</TypeToken>
          {i < names.length - 1 && <span className="text-muted-foreground">,</span>}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 4: `KeywordsPage.tsx`** — по образцу `DependenciesPage.tsx`:

```tsx
import { useRef, useState } from 'react';
import { Download, Plus, Upload, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { Input } from '@/components/ui/input';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { useKeywords } from '@/lib/keywords';
import { splitTags } from '@/lib/parse';

/** Синонимы ключевого слова: список с полем добавления. */
function SynonymsList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const items = splitTags(text);
    if (items.length) onChange([...value, ...items]);
    setText('');
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          className="h-10 md:h-9"
          aria-label="Новый синоним"
          placeholder="Новый синоним"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 md:h-9"
        >
          <Plus className="size-3.5" /> Добавить
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Синонимов пока нет.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border">
          {value.map((v, i) => (
            <li key={`${v}-${i}`} className="group flex min-h-10 items-center gap-2 px-3 py-1 hover:bg-muted md:min-h-9">
              <span className="min-w-0 flex-1 break-words text-sm">{v}</span>
              <button
                type="button"
                aria-label={`Удалить синоним ${v}`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTION = 'inline-flex h-8 items-center gap-1 rounded-sm px-1.5 text-[13px] font-medium text-muted-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function KeywordsPage() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const items = useKeywords(projectId);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['keywords', projectId] });
  const create = useMutation({ mutationFn: (name: string) => api.keywords.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.keywords.remove(id), onSuccess: refresh });

  const importFile = async (file: File) => {
    try {
      const r = await api.keywords.import(projectId, await file.text());
      refresh();
      toast.success(`Добавлено: ${r.added}, обновлено: ${r.updated}${r.skipped ? `, пропущено строк: ${r.skipped}` : ''}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DictionaryMaster
      kind="keyword"
      mono
      base="/lists/keywords"
      items={items}
      loading={false}
      meta={(i) => (i.synonyms.length ? { text: String(i.synonyms.length) } : { text: 'нет синонимов', warn: true })}
      subtitle={(i) => i.synonyms.join(', ')}
      listActions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
          <button type="button" className={ACTION} onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> Импорт .txt</button>
          <button type="button" className={ACTION} onClick={() => void api.keywords.exportTxt(projectId)}><Download className="size-3.5" /> Экспорт .txt</button>
        </>
      }
      body={(d, patch) => (
        <DictCard title="Синонимы" count={d.synonyms.length}>
          <SynonymsList value={d.synonyms} onChange={(synonyms) => patch({ synonyms })} />
        </DictCard>
      )}
      emptyText="Ключевых слов пока нет"
      createTitle="Новое ключевое слово"
      deleteTitle={(d) => `Удалить ключевое слово ${d.name}?`}
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        await api.keywords.save(d.id, { name: d.name, synonyms: d.synonyms });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
```
Если `DictionaryMaster` не рендерит страницу без `loading` для первого рендера — оставить `loading={false}`; если `useKeywords` нужно отличать «загрузка» — вернуть из хука `isPending` отдельно (не требуется для первой версии).

- [ ] **Step 5: Навигация и маршруты**
  - `App.tsx`: импорт `KeywordsPage`, `<Route path="lists/keywords/:itemId?" element={<KeywordsPage />} />` рядом с `dependencies`.
  - `AppShell.tsx`: в `DICTIONARY` после зависимостей `{ to: '/lists/keywords', label: 'Ключевые слова', icon: Tags, key: 'keywords' }` (иконка `Tags` из `lucide-react`; расширить union `key` значением `'keywords'`); в `useCounts` добавить `const keywords = useQuery({ queryKey: ['keywords', projectId], queryFn: () => api.keywords.list(projectId) });` и `keywords: keywords.data?.length` в `counts`.
  - `CommandPalette.tsx`: в список типов `{ kind: 'keyword', title: 'Ключевые слова' }`; запрос `useQuery({ queryKey: ['keywords', projectId], queryFn: () => api.keywords.list(projectId), ...enabled })` и хиты `({ key: `k${k.id}`, kind: 'keyword', name: k.name, hint: `${k.synonyms.length} син.`, to: path(`/lists/keywords/${k.id}`) })` по образцу зависимостей.

- [ ] **Step 6: Проверка**

Run: `npx tsc --noEmit -p web && npm test -w web`
Expected: PASS. Затем запустить приложение (`npm run dev`, навык `run`), открыть «Ключевые слова»: создать слово, добавить синонимы, экспорт .txt, импорт этого же файла (отчёт «Добавлено: 0, обновлено: N»).

- [ ] **Step 7: Commit**

```bash
git add web && git commit -m "feat: страница справочника «Ключевые слова» с импортом и экспортом txt"
```

---

### Task 7: Колонка ключевых слов на странице интента и в модалке сценария

**Files:**
- Modify: `web/src/pages/intents/PhrasesCell.tsx`, `web/src/pages/intents/IntentsTable.tsx`

**Interfaces:**
- Consumes: `useKeywordMatcher`, `KeywordChips`, режим `'keywords'`.

- [ ] **Step 1: `PhrasesCell.tsx`**
  - Импорты: `import { KeywordChips } from '@/components/KeywordChips';`, `import { useKeywordMatcher } from '@/lib/keywords';`.
  - В теле компонента: `const projectId = useProjectId(); const matchKw = useKeywordMatcher(projectId); const kw = mode === 'keywords';`.
  - Строка добавления: сразу после `</div>` обёртки поля ввода (перед кнопкой «Добавить несколько») вставить:

```tsx
          {kw && (
            <div aria-label="Ключевые слова новой фразы" className="hidden h-10 min-w-0 flex-1 items-center rounded-md border border-dashed bg-muted/40 px-3 md:flex md:h-9">
              <KeywordChips names={matchKw(text)} placeholder="ключевые слова" />
            </div>
          )}
```
  - Строка списка: после `<span className="min-w-0 flex-1 self-center …">…</span>` (текст фразы) вставить:

```tsx
            {kw && (
              <span className="hidden w-[40%] shrink-0 items-center border-l px-3 py-1 md:flex">
                <KeywordChips names={matchKw(v.text)} />
              </span>
            )}
```
  - На узких экранах (`< md`) колонка скрыта — вместо неё под текстом фразы показать те же чипы: внутрь span текста фразы добавить `{kw && <span className="mt-1 block md:hidden"><KeywordChips names={matchKw(v.text)} /></span>}`.

- [ ] **Step 2: `IntentsTable.tsx` — `PhrasesEditor`**
  - Импорты те же; в `PhrasesEditor` добавить `const matchKw = useKeywordMatcher(useProjectId()); const kw = mode === 'keywords';` (хук вызывать на верхнем уровне компонента, `useProjectId` уже импортирован в файле).
  - В строке значения: после блока с `<Input …/>`/`role="textbox"` и перед кнопкой удаления вставить:

```tsx
          {kw && (
            <span className="hidden w-[38%] shrink-0 items-center border-l border-input px-2 md:flex">
              <KeywordChips names={matchKw(v.text)} />
            </span>
          )}
```
  - В строке добавления: после `</div>` обёртки поля ввода (перед `<Button … Добавить несколько>`) вставить аналогичный блок с `names={matchKw(text)}`, `placeholder="ключевые слова"`, классами `hidden h-8 w-[38%] shrink-0 items-center rounded-md border border-dashed bg-muted/40 px-2 md:flex`.
  - Модалка `max-w-xl` может быть тесной: поднять до `max-w-2xl` только для режима `keywords` (`className={cn('…', kw && 'max-w-2xl')}` на `DialogContent`; найти его в `IntentRow`, строки ~334–382, и использовать уже импортированный `cn`).

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit -p web`
Expected: PASS. Затем в запущенном приложении: «Настройки» → «Фразы + ключевые слова». В справочнике создать `OFF: выключи, отключи`, `SOUND: звук, радио`. На странице интента и в модалке интента сценария ввести «выключи звук»: пока набираете, в средней колонке появляются `$OFF, $SOUND`; после добавления колонка у строки заполнена, на узком окне чипы под фразой. «Предпросмотр» сценария в этом режиме показывает колонки Intent | Keywords | Example phrases | Entities.

- [ ] **Step 4: Commit**

```bash
git add web && git commit -m "feat: колонка ключевых слов у фраз интента и в модалке сценария"
```

---

### Task 8: Демо-данные и итоговая проверка

**Files:**
- Modify: `core/src/demo.ts`
- Test: `core/test/extras.test.ts` (или тест демо, если он есть — найти `seedDemo` в `core/test`)

- [ ] **Step 1:** в `seedDemo` после создания сущностей (после `const time = …`) добавить импорт ключевых слов через уже используемый `call`:

```ts
  await call(app, 'POST', `/api/projects/${pid}/keywords/import`, {
    text: 'ON: включи, включить, запусти\nOFF: выключи, выключить, отключи\nWARMER: теплее, потеплее, прибавь\nCOLDER: холоднее, прохладнее, убавь\nTEMPERATURE: температура, температуру, градус\n',
  });
```

- [ ] **Step 2:** добавить в существующий тест демо проверку: после `seedDemo(app)` `GET /api/projects/${pid}/keywords` возвращает 5 элементов (подогнать под структуру существующего теста).

- [ ] **Step 3: Полная проверка**

Run: `npm test && npm run typecheck -w core && npx tsc --noEmit -p web && npm run build`
Expected: всё зелёное, сборка проходит.

- [ ] **Step 4: Commit**

```bash
git add core && git commit -m "feat: ключевые слова в демо-проекте"
```
