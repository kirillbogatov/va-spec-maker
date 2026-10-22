# Entity Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать сущностям тип (строка, число, время, дата, логический) и диапазон для числа, времени и даты.

**Architecture:** Три новые колонки в `entities` (`type`, `range_min`, `range_max`) и миграция `user_version = 2`. Валидация типа и диапазона вынесена в `core/src/entity-types.ts` и используется роутом. Веб получает общий компонент `EntityTypeFields`, который используется в диалоге создания и на странице сущности.

**Tech Stack:** TypeScript, sql.js, vitest (core и web), React 19, @base-ui/react Select, TanStack Query.

Спека: `docs/superpowers/specs/2026-10-22-entity-types-design.md`.

## Global Constraints

- Типы: `string|number|time|date|boolean`; по умолчанию `string`.
- Формат границ диапазона: число `15` / `12.5`, время `HH:MM`, дата `YYYY-MM-DD`. Пустая строка — граница не задана. Обе границы необязательны.
- Диапазон есть только у `number|time|date`. `min > max` — ошибка 400.
- Значения (`values` + синонимы) хранятся только у `string`; при другом типе они удаляются.
- Тексты интерфейса и ошибок — на русском.
- **В рабочем дереве уже есть незакоммиченные правки пользователя в файлах, которые мы меняем** (`db.ts`, `entities.ts`, `demo.ts`, `EntitiesPage.tsx` и др.). Поэтому коммиты в задачах НЕ делаем: `git add` захватил бы чужие правки. В конце сообщаем пользователю, что изменения не закоммичены.
- Тесты core: `cd core && npx vitest run <файл>`. Тесты web: `cd web && npx vitest run <файл>`. Проверка типов web: `cd web && npx tsc --noEmit -p .` (если в проекте tsconfig разделён на несколько файлов, использовать `npm run build -w web`).

---

### Task 1: Схема, миграция, валидация и API (core)

**Files:**
- Create: `core/src/entity-types.ts`
- Modify: `core/src/db.ts` (колонки в `SCHEMA`, функция `migrate`)
- Modify: `core/src/routes/entities.ts`
- Test: `core/test/entities.test.ts`, `core/test/migration.test.ts`

**Interfaces:**
- Produces (`core/src/entity-types.ts`):
  - `ENTITY_TYPES: readonly ['string','number','time','date','boolean']`
  - `type EntityType`
  - `ENTITY_TYPE_LABEL: Record<EntityType, string>` — `Строка`, `Число`, `Время`, `Дата`, `Логический`
  - `rangeText(type: string, min: string, max: string): string` — `от 15 до 30`, `от 15`, `до 30` или `''`
  - `parseEntityKind(body: any, current?: { type: EntityType; range_min: string; range_max: string }): { type: EntityType; range_min: string; range_max: string }` — бросает `badRequest`
- Produces (API): `GET/POST/PUT` сущностей возвращают и принимают `type`, `range_min`, `range_max`.

- [ ] **Step 1: Написать падающие тесты API**

Добавить в `core/test/entities.test.ts` внутрь `describe('entities API', ...)` перед `returns 404`:

```ts
  it('defaults to the string type', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'a' });
    const get = await request(app).get(`/api/entities/${c.body.id}`);
    expect(get.body).toMatchObject({ type: 'string', range_min: '', range_max: '' });
  });

  it('creates a typed entity with a range', async () => {
    const { app, pid } = await setup();
    const c = await request(app)
      .post(`/api/projects/${pid}/entities`)
      .send({ name: 'temp', type: 'number', range_min: '15', range_max: '30' });
    expect(c.status).toBe(201);
    const list = await request(app).get(`/api/projects/${pid}/entities`);
    expect(list.body[0]).toMatchObject({ type: 'number', range_min: '15', range_max: '30' });
  });

  it('accepts one-sided ranges for number, time and date', async () => {
    const { app, pid } = await setup();
    const ok = async (name: string, type: string, range_min: string, range_max: string) =>
      (await request(app).post(`/api/projects/${pid}/entities`).send({ name, type, range_min, range_max })).status;
    expect(await ok('n', 'number', '-1.5', '')).toBe(201);
    expect(await ok('t', 'time', '', '23:00')).toBe(201);
    expect(await ok('d', 'date', '2026-01-01', '2026-12-31')).toBe(201);
  });

  it('rejects unknown types, bad bounds and inverted ranges', async () => {
    const { app, pid } = await setup();
    const post = (body: object) => request(app).post(`/api/projects/${pid}/entities`).send({ name: 'x', ...body });
    expect((await post({ type: 'color' })).status).toBe(400);
    expect((await post({ type: 'number', range_min: 'abc' })).status).toBe(400);
    expect((await post({ type: 'time', range_min: '25:00' })).status).toBe(400);
    expect((await post({ type: 'date', range_min: '2026-02-30' })).status).toBe(400);
    expect((await post({ type: 'number', range_min: '30', range_max: '15' })).status).toBe(400);
    expect((await post({ type: 'time', range_min: '22:00', range_max: '06:00' })).status).toBe(400);
    expect((await post({ type: 'string', range_min: '1' })).status).toBe(400);
    expect((await post({ type: 'boolean', range_max: '1' })).status).toBe(400);
  });

  it('drops values when the type changes away from string', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'room' });
    await request(app)
      .put(`/api/entities/${c.body.id}`)
      .send({ name: 'room', values: [{ value: 'kitchen', synonyms: ['кухня'] }] });
    const put = await request(app)
      .put(`/api/entities/${c.body.id}`)
      .send({ name: 'room', type: 'number', range_min: '1', range_max: '5', values: [{ value: 'kitchen', synonyms: [] }] });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ type: 'number', range_min: '1', range_max: '5', values: [] });
  });

  it('keeps type and range when PUT omits them, and resets the range when only the type changes', async () => {
    const { app, pid } = await setup();
    const c = await request(app)
      .post(`/api/projects/${pid}/entities`)
      .send({ name: 'temp', type: 'number', range_min: '15', range_max: '30' });
    const keep = await request(app).put(`/api/entities/${c.body.id}`).send({ name: 'temp', description: 'x' });
    expect(keep.body).toMatchObject({ type: 'number', range_min: '15', range_max: '30' });
    const change = await request(app).put(`/api/entities/${c.body.id}`).send({ name: 'temp', type: 'boolean' });
    expect(change.body).toMatchObject({ type: 'boolean', range_min: '', range_max: '' });
  });
```

- [ ] **Step 2: Написать падающие тесты миграции**

В `core/test/migration.test.ts`:
1. В тесте `stamps a fresh database with version 1` переименовать в `version 2` и `expect(userVersion(db)).toBe(2)`.
2. В тесте `turns ownership and usage ...` строку `expect(userVersion(db)).toBe(1);` заменить на `toBe(2)`.
3. Добавить в конец `describe('migrate', ...)`:

```ts
  it('adds entity type columns to an older database and keeps existing entities as strings', async () => {
    const db = await openDb();
    for (const col of ['type', 'range_min', 'range_max']) db.exec(`ALTER TABLE entities DROP COLUMN ${col}`);
    db.exec('PRAGMA user_version = 1');
    const pid = createProject(db);
    db.prepare('INSERT INTO entities(project_id, name) VALUES (?, ?)').run(pid, 'ROOM');

    migrate(db);

    expect(db.prepare('SELECT type, range_min, range_max FROM entities').get()).toEqual({ type: 'string', range_min: '', range_max: '' });
    expect(userVersion(db)).toBe(2);
    migrate(db);
    expect(userVersion(db)).toBe(2);
  });
```

Если `DROP COLUMN` не поддерживается версией SQLite в sql.js — вместо него пересоздать таблицу `entities` без трёх колонок (`CREATE TABLE entities_old AS SELECT id, project_id, name, description, multiple_values, followup_prompt FROM entities; DROP TABLE entities; ALTER TABLE entities_old RENAME TO entities`; внешние ключи для теста не важны, т.к. таблица пуста).

- [ ] **Step 3: Запустить тесты, убедиться, что падают**

Run: `cd core && npx vitest run test/entities.test.ts test/migration.test.ts`
Expected: FAIL (нет полей `type`, версия 1).

- [ ] **Step 4: Создать `core/src/entity-types.ts`**

```ts
import { badRequest } from './errors';

export const ENTITY_TYPES = ['string', 'number', 'time', 'date', 'boolean'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  string: 'Строка',
  number: 'Число',
  time: 'Время',
  date: 'Дата',
  boolean: 'Логический',
};

export interface EntityKind {
  type: EntityType;
  range_min: string;
  range_max: string;
}

const RANGE_TYPES: EntityType[] = ['number', 'time', 'date'];

function validBound(type: EntityType, s: string): boolean {
  if (type === 'number') return /^-?\d+(\.\d+)?$/.test(s);
  if (type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Время и дата в каноническом виде сравниваются как строки. */
const greater = (type: EntityType, a: string, b: string) => (type === 'number' ? Number(a) > Number(b) : a > b);

export function rangeText(type: string, min: string, max: string): string {
  if (!RANGE_TYPES.includes(type as EntityType)) return '';
  if (min && max) return `от ${min} до ${max}`;
  if (min) return `от ${min}`;
  if (max) return `до ${max}`;
  return '';
}

const bound = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Читает тип и диапазон из тела запроса. Поля, которых в теле нет, берутся из current
 * (диапазон — только если тип не менялся).
 */
export function parseEntityKind(body: any, current?: EntityKind): EntityKind {
  const type = body?.type === undefined ? (current?.type ?? 'string') : body.type;
  if (!ENTITY_TYPES.includes(type)) throw badRequest('Неизвестный тип сущности');
  const same = !current || current.type === type;
  const range_min = body?.range_min === undefined ? (same ? (current?.range_min ?? '') : '') : bound(body.range_min);
  const range_max = body?.range_max === undefined ? (same ? (current?.range_max ?? '') : '') : bound(body.range_max);
  if (!RANGE_TYPES.includes(type)) {
    if (range_min || range_max) throw badRequest('Диапазон можно задать только для числа, времени и даты');
    return { type, range_min: '', range_max: '' };
  }
  for (const [label, v] of [['Начало диапазона', range_min], ['Конец диапазона', range_max]] as const) {
    if (v && !validBound(type, v)) throw badRequest(`${label} указано в неверном формате`);
  }
  if (range_min && range_max && greater(type, range_min, range_max)) {
    throw badRequest('Начало диапазона не может быть больше конца');
  }
  return { type, range_min, range_max };
}
```

- [ ] **Step 5: Схема и миграция в `core/src/db.ts`**

В `CREATE TABLE IF NOT EXISTS entities` после строки `followup_prompt ...` добавить:

```sql
  type TEXT NOT NULL DEFAULT 'string',
  range_min TEXT NOT NULL DEFAULT '',
  range_max TEXT NOT NULL DEFAULT '',
```

Функцию `migrate` заменить на (тело версии 1 не меняется, только оборачивается):

```ts
export function migrate(db: Db): void {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version < 1) {
    db.transaction(() => {
      for (const [table, link, col] of [['intents', 'scenario_intents', 'intent_id'], ['prompts', 'scenario_prompts', 'prompt_id']] as const) {
        if (!hasColumn(db, table, 'scenario_id')) continue;
        db.exec(`INSERT OR IGNORE INTO ${link}(scenario_id, ${col}) SELECT scenario_id, id FROM ${table} WHERE scenario_id IS NOT NULL ORDER BY id;
                 UPDATE ${table} SET scenario_id = NULL;`);
      }
      if (hasColumn(db, 'scenario_steps', 'any_intent')) {
        db.exec(`UPDATE scenario_steps SET kind = 'error', intent_id = NULL WHERE any_intent = 1;
                 UPDATE scenario_steps SET any_intent = 0;`);
      }
      db.exec(`INSERT OR IGNORE INTO scenario_intents(scenario_id, intent_id)
                 SELECT DISTINCT scenario_id, intent_id FROM scenario_steps WHERE intent_id IS NOT NULL ORDER BY scenario_id, intent_id;
               INSERT OR IGNORE INTO scenario_prompts(scenario_id, prompt_id)
                 SELECT scenario_id, prompt_id FROM scenario_steps WHERE prompt_id IS NOT NULL
                 UNION SELECT scenario_id, prompt_id FROM scenario_states WHERE prompt_id IS NOT NULL;`);
    })();
    db.exec('PRAGMA user_version = 1');
  }
  if (user_version < 2) {
    // Версия 2: у сущностей появились тип и диапазон. Существующие становятся строками.
    for (const ddl of ["type TEXT NOT NULL DEFAULT 'string'", "range_min TEXT NOT NULL DEFAULT ''", "range_max TEXT NOT NULL DEFAULT ''"]) {
      if (!hasColumn(db, 'entities', ddl.split(' ')[0])) db.exec(`ALTER TABLE entities ADD COLUMN ${ddl}`);
    }
    db.exec('PRAGMA user_version = 2');
  }
}
```

Комментарий над функцией (`Версия 1: ...`) оставить и дополнить строкой «Версия 2: тип и диапазон сущностей.».

- [ ] **Step 6: Роут `core/src/routes/entities.ts`**

1. Импорт: `import { parseEntityKind, type EntityKind } from '../entity-types';`
2. В `load`: в `SELECT` добавить `type, range_min, range_max`, а в тип результата — `type: EntityType; range_min: string; range_max: string` (импортировать `EntityType`).
3. В `POST`:

```ts
    const name = requireString(req.body?.name, 'Название');
    const kind = parseEntityKind(req.body);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const info = db
      .prepare('INSERT INTO entities(project_id, name, type, range_min, range_max) VALUES (?, ?, ?, ?, ?)')
      .run(pid, name, kind.type, kind.range_min, kind.range_max);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, ...kind });
```

4. В `PUT`: `load(id)` сохранить в `const current = load(id);`, затем:

```ts
    const kind: EntityKind = parseEntityKind(req.body, current);
    const values = kind.type === 'string' ? cleanValues(req.body?.values) : [];
```
   и `UPDATE`:
```ts
      db.prepare('UPDATE entities SET name = ?, description = ?, multiple_values = ?, type = ?, range_min = ?, range_max = ? WHERE id = ?').run(
        name, description, req.body?.multiple_values ? 1 : 0, kind.type, kind.range_min, kind.range_max, id,
      );
```
   Если `values` в теле не передан и тип `string`, поведение прежнее (значения заменяются пустым списком) — это существующее поведение, не менять.

- [ ] **Step 7: Запустить тесты**

Run: `cd core && npx vitest run test/entities.test.ts test/migration.test.ts`
Expected: PASS. Затем `cd core && npx vitest run` — весь набор core зелёный (тесты экспорта могут не затрагиваться пока).

---

### Task 2: Экспорт и демо (core)

**Files:**
- Modify: `core/src/export/model.ts` (тип `ProjectSpec.entities` и запрос ~строки 21-25, 132-146)
- Modify: `core/src/export/tables.ts` (`ENTITIES_HEAD`, `entitiesTable`)
- Modify: `core/src/demo.ts`
- Test: `core/test/export.test.ts`, `core/test/projects.test.ts`

**Interfaces:**
- Consumes (Task 1): `ENTITY_TYPE_LABEL`, `rangeText` из `core/src/entity-types.ts`.
- Produces: `ProjectSpec.entities[i]` содержит `type: string; range_min: string; range_max: string`.

- [ ] **Step 1: Падающий тест экспорта**

Открыть `core/test/export.test.ts`, найти фикстуру со `entities: [{ name: 'seat_position', multiple_values: true, ...` (строка ~25). Добавить в неё `type: 'number', range_min: '1', range_max: '3'` и новую сущность без диапазона `{ name: 'ROOM', type: 'string', range_min: '', range_max: '', multiple_values: false, values: [...] }` (скопировать форму существующей). Рядом с существующими проверками таблицы сущностей добавить проверку вывода markdown:

```ts
expect(md).toContain('Число');
expect(md).toContain('от 1 до 3');
```

(`md` — имя переменной с markdown-результатом в этом тесте; если переменная называется иначе, использовать её. Если в файле нет теста, собирающего markdown из фикстуры, добавить новый `it`, вызвав ту же функцию, что используют соседние тесты.)

Run: `cd core && npx vitest run test/export.test.ts`
Expected: FAIL.

- [ ] **Step 2: Модель**

В `core/src/export/model.ts`:
- в `ProjectSpec.entities` добавить поля `type: string; range_min: string; range_max: string;`
- запрос: `SELECT id, name, type, range_min, range_max, multiple_values FROM entities ...`, тип результата `{ id: number; name: string; type: string; range_min: string; range_max: string; multiple_values: number }`
- в `.map((e) => ({ ... }))` добавить `type: e.type, range_min: e.range_min, range_max: e.range_max,`; значения читать только для `e.type === 'string'`, иначе `[]` (внутри `values: e.type === 'string' ? (...) : []`).

- [ ] **Step 3: Таблица**

В `core/src/export/tables.ts`:

```ts
import { ENTITY_TYPE_LABEL, rangeText, type EntityType } from '../entity-types';

export const ENTITIES_HEAD = ['Сущность', 'Тип', 'Значения', 'Несколько значений', 'Уточняющий вопрос'];
```

В `entitiesTable`: `widths: [16, 16, 32, 12, 24]`, и в `cells` после имени вставить ячейку типа:

```ts
          text([ENTITY_TYPE_LABEL[e.type as EntityType] ?? e.type, rangeText(e.type, e.range_min, e.range_max)].filter(Boolean).join('\n')),
```

Ячейка значений: `e.type === 'string' ? { bullets: ... } : text('-')` (существующий `bullets`-литерал оставить для строки).

- [ ] **Step 4: Демо**

В `core/src/demo.ts` заменить хелпер `entity` на версию с типом:

```ts
  const entity = async (
    name: string,
    description: string,
    values: [string, string[]][],
    kind: { type?: string; range_min?: string; range_max?: string } = {},
  ) => {
    const { id } = await call(app, 'POST', `/api/projects/${pid}/entities`, { name, ...kind });
    await call(app, 'PUT', `/api/entities/${id}`, {
      name, description, multiple_values: false, ...kind, values: values.map(([value, synonyms]) => ({ value, synonyms })),
    });
    return id as number;
  };
```

Сущности:

```ts
  const temp = await entity('TEMP_VALUE', 'Целевая температура', [], { type: 'number', range_min: '15', range_max: '30' });
  const time = await entity('TIME', 'Время', [], { type: 'time', range_min: '05:00', range_max: '23:00' });
  const alarmDate = await entity('ALARM_DATE', 'Дата будильника', [], { type: 'date' });
  const alarmRepeat = await entity('ALARM_REPEAT', 'Повторять будильник', [], { type: 'boolean' });
```

(`ROOM` и `TEMP_MODE` без изменений.) В сценарии «Будильник» поле `entities` заменить на:

```ts
    entities: [
      { entity_id: time, followup_prompt: 'На какое время?', required: true, is_array: false },
      { entity_id: alarmDate, followup_prompt: 'На какую дату?', required: false, is_array: false },
      { entity_id: alarmRepeat, followup_prompt: 'Повторять каждый день?', required: false, is_array: false },
    ],
```

Старые вызовы `entity(...)` для `temp` и `time` с массивами значений удалить (их заменяют строки выше).

- [ ] **Step 5: Тест демо и дампа**

В `core/test/projects.test.ts` в `describe('project duplicate / import', ...)` добавить:

```ts
  it('keeps entity types and ranges through the demo, duplicate and dump', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const types = async (pid: number) =>
      Object.fromEntries(((await request(app).get(`/api/projects/${pid}/entities`)).body as any[]).map((e) => [e.name, [e.type, e.range_min, e.range_max]]));
    expect(await types(src)).toMatchObject({
      ROOM: ['string', '', ''],
      TEMP_VALUE: ['number', '15', '30'],
      TIME: ['time', '05:00', '23:00'],
      ALARM_DATE: ['date', '', ''],
      ALARM_REPEAT: ['boolean', '', ''],
    });
    const dup = (await request(app).post(`/api/projects/${src}/duplicate`)).body;
    expect(await types(dup.id)).toEqual(await types(src));
    const dump = (await request(app).get(`/api/projects/${src}/dump`)).body;
    const imported = (await request(app).post('/api/projects/import').send(dump)).body;
    expect(await types(imported.id)).toEqual(await types(src));
  });
```

- [ ] **Step 6: Запустить весь набор core**

Run: `cd core && npx vitest run`
Expected: PASS. Если упал существующий тест на число сущностей или значений демо — поправить ожидание под новые данные (6 сущностей; у `TEMP_VALUE` и `TIME` нет значений).

---

### Task 3: Веб — типы, API, общий компонент, диалог, страница

**Files:**
- Create: `web/src/lib/entityTypes.ts`, `web/src/lib/entityTypes.test.ts`
- Create: `web/src/components/EntityTypeFields.tsx`
- Modify: `web/src/lib/types.ts`, `web/src/lib/api.ts`
- Modify: `web/src/components/CreateDialog.tsx`, `web/src/components/DictionaryMaster.tsx`
- Modify: `web/src/pages/entities/EntitiesPage.tsx`, `web/src/pages/scenarios/ScenarioEntities.tsx`

**Interfaces:**
- Produces (`web/src/lib/entityTypes.ts`):
  - `type EntityType = 'string'|'number'|'time'|'date'|'boolean'`
  - `interface EntityKind { type: EntityType; range_min: string; range_max: string }`
  - `DEFAULT_KIND: EntityKind`
  - `ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[]`
  - `entityTypeLabel(type: EntityType): string`
  - `hasRange(type: EntityType): boolean`
  - `rangeError(kind: EntityKind): string | null` — `'Начало диапазона больше конца'` или `null`
  - `rangeSummary(kind: EntityKind): string` — `от 15 до 30`, `от 15`, `до 30` или `''`
- Produces (`EntityTypeFields`): props `{ kind: EntityKind; onChange: (kind: EntityKind) => void }`.
- Produces: `api.entities.create(pid, name, kind?: EntityKind)`; `CreateDialog` проп `withType?: boolean`, `onCreate: (name: string, kind?: EntityKind) => void`; `DictionaryMaster` проп `createWithType?: boolean`, `onCreate?: (name: string, kind?: EntityKind) => Promise<{ id: number }>`.

- [ ] **Step 1: Падающий тест `web/src/lib/entityTypes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_KIND, entityTypeLabel, hasRange, rangeError, rangeSummary } from './entityTypes';

describe('entityTypes', () => {
  it('has a range only for number, time and date', () => {
    expect(['string', 'number', 'time', 'date', 'boolean'].map((t) => hasRange(t as never))).toEqual([false, true, true, true, false]);
  });

  it('labels types in Russian', () => {
    expect(entityTypeLabel('boolean')).toBe('Логический');
    expect(DEFAULT_KIND).toEqual({ type: 'string', range_min: '', range_max: '' });
  });

  it('detects an inverted range', () => {
    expect(rangeError({ type: 'number', range_min: '30', range_max: '15' })).toBe('Начало диапазона больше конца');
    expect(rangeError({ type: 'number', range_min: '9', range_max: '10' })).toBeNull();
    expect(rangeError({ type: 'time', range_min: '22:00', range_max: '06:00' })).not.toBeNull();
    expect(rangeError({ type: 'date', range_min: '2026-01-01', range_max: '' })).toBeNull();
  });

  it('summarises a range', () => {
    expect(rangeSummary({ type: 'number', range_min: '15', range_max: '30' })).toBe('от 15 до 30');
    expect(rangeSummary({ type: 'number', range_min: '15', range_max: '' })).toBe('от 15');
    expect(rangeSummary({ type: 'time', range_min: '', range_max: '23:00' })).toBe('до 23:00');
    expect(rangeSummary({ type: 'string', range_min: '', range_max: '' })).toBe('');
  });
});
```

Run: `cd web && npx vitest run src/lib/entityTypes.test.ts` → FAIL (нет модуля).

- [ ] **Step 2: `web/src/lib/entityTypes.ts`**

```ts
export type EntityType = 'string' | 'number' | 'time' | 'date' | 'boolean';
export interface EntityKind { type: EntityType; range_min: string; range_max: string }

export const DEFAULT_KIND: EntityKind = { type: 'string', range_min: '', range_max: '' };

export const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'string', label: 'Строка' },
  { value: 'number', label: 'Число' },
  { value: 'time', label: 'Время' },
  { value: 'date', label: 'Дата' },
  { value: 'boolean', label: 'Логический (true/false)' },
];

export const entityTypeLabel = (type: EntityType): string =>
  type === 'boolean' ? 'Логический' : (ENTITY_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type);

export const hasRange = (type: EntityType): boolean => type === 'number' || type === 'time' || type === 'date';

/** Время и дата в каноническом виде сравниваются как строки. */
export function rangeError({ type, range_min: min, range_max: max }: EntityKind): string | null {
  if (!hasRange(type) || !min || !max) return null;
  const inverted = type === 'number' ? Number(min) > Number(max) : min > max;
  return inverted ? 'Начало диапазона больше конца' : null;
}

export function rangeSummary({ type, range_min: min, range_max: max }: EntityKind): string {
  if (!hasRange(type)) return '';
  if (min && max) return `от ${min} до ${max}`;
  if (min) return `от ${min}`;
  if (max) return `до ${max}`;
  return '';
}
```

Run тест из Step 1 → PASS.

- [ ] **Step 3: Типы и API**

`web/src/lib/types.ts`: добавить вверху `import type { EntityType } from './entityTypes';` и в `interface Entity` после `multiple_values: boolean;` строки `type: EntityType; range_min: string; range_max: string;`.

`web/src/lib/api.ts`: импорт `import type { EntityKind } from './entityTypes';`, затем:

```ts
    create: (pid: number, name: string, kind?: EntityKind) =>
      req<{ id: number; name: string }>('POST', `/api/projects/${pid}/entities`, { name, ...kind }),
    save: (
      id: number,
      body: { name: string; description: string; multiple_values: boolean; values: EntityValue[] } & EntityKind,
    ) =>
      req<Entity>('PUT', `/api/entities/${id}`, body),
```

(Если импорты в `api.ts` собраны в одну строку из `./types`, добавить отдельную строку для `./entityTypes`.)

- [ ] **Step 4: Компонент `web/src/components/EntityTypeFields.tsx`**

```tsx
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ENTITY_TYPE_OPTIONS, hasRange, rangeError, type EntityKind, type EntityType } from '@/lib/entityTypes';

const INPUT_TYPE = { number: 'number', time: 'time', date: 'date' } as const;

interface Props {
  kind: EntityKind;
  onChange: (kind: EntityKind) => void;
}

/** Тип сущности и, для числа, времени и даты, диапазон «от — до». */
export function EntityTypeFields({ kind, onChange }: Props) {
  const error = rangeError(kind);
  const label = ENTITY_TYPE_OPTIONS.find((o) => o.value === kind.type)?.label;
  return (
    <div className="space-y-2">
      <Select
        items={ENTITY_TYPE_OPTIONS}
        value={kind.type}
        onValueChange={(v) => v && onChange({ type: v as EntityType, range_min: '', range_max: '' })}
      >
        <SelectTrigger className="w-full max-md:h-10" aria-label="Тип сущности">
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ENTITY_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasRange(kind.type) && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[13px] text-muted-foreground">
            От
            <Input
              type={INPUT_TYPE[kind.type as keyof typeof INPUT_TYPE]}
              step={kind.type === 'number' ? 'any' : undefined}
              value={kind.range_min}
              onChange={(e) => onChange({ ...kind, range_min: e.target.value })}
              aria-label="Начало диапазона"
              aria-invalid={!!error}
            />
          </label>
          <label className="space-y-1 text-[13px] text-muted-foreground">
            До
            <Input
              type={INPUT_TYPE[kind.type as keyof typeof INPUT_TYPE]}
              step={kind.type === 'number' ? 'any' : undefined}
              value={kind.range_max}
              onChange={(e) => onChange({ ...kind, range_max: e.target.value })}
              aria-label="Конец диапазона"
              aria-invalid={!!error}
            />
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {kind.type === 'boolean' && <p className="text-[13px] text-muted-foreground">Принимает значения true или false.</p>}
    </div>
  );
}
```

Примечание: смена типа внутри компонента обнуляет диапазон; подтверждение очистки при наличии данных делает страница (Step 7), перехватывая `onChange`.

- [ ] **Step 5: `CreateDialog`**

В `web/src/components/CreateDialog.tsx`:
- импорты `import { EntityTypeFields } from '@/components/EntityTypeFields';` и `import { DEFAULT_KIND, rangeError, type EntityKind } from '@/lib/entityTypes';`
- в `Props`: `onCreate: (name: string, kind?: EntityKind) => void;` и `/** Показать выбор типа сущности и диапазона. */ withType?: boolean;`
- в компоненте: `withType = false` в деструктуризации; `const [kind, setKind] = useState<EntityKind>(DEFAULT_KIND);`; в `useEffect` при `open` дополнительно `setKind(DEFAULT_KIND)`;
- `const invalid = withType && !!rangeError(kind);` и в `submit`: `if (empty || duplicate || invalid) return; onCreate(name.trim(), withType ? kind : undefined);`
- после `<Input .../>` и сообщения о дубликате: `{withType && <EntityTypeFields kind={kind} onChange={setKind} />}`
- кнопка: `disabled={empty || duplicate || invalid}`.

- [ ] **Step 6: `DictionaryMaster`**

В `web/src/components/DictionaryMaster.tsx`:
- импорт `import type { EntityKind } from '@/lib/entityTypes';`
- в `Props`: `createWithType?: boolean;` и `onCreate?: (name: string, kind?: EntityKind) => Promise<{ id: number }>;`
- у `<CreateDialog ...>`: добавить `withType={p.createWithType}` и `onCreate={(n, kind) => p.onCreate!(n, kind).then((c) => navigate(path(`${p.base}/${c.id}`)))}`.

- [ ] **Step 7: `EntitiesPage`**

В `web/src/pages/entities/EntitiesPage.tsx`:
- импорты: `useState` из `react`, `DictCard` из `@/components/DictionaryMaster` (расширить существующий импорт), `ConfirmDialog` из `@/components/ConfirmDialog`, `EntityTypeFields` из `@/components/EntityTypeFields`, `entityTypeLabel`, `hasRange`, `type EntityKind` из `@/lib/entityTypes`.
- мутация создания: `mutationFn: ({ name, kind }: { name: string; kind?: EntityKind }) => api.entities.create(projectId, name, kind)`; `onCreate={(n, kind) => create.mutateAsync({ name: n, kind })}`; добавить `createWithType`.
- `meta`:

```tsx
      meta={(i) =>
        i.type !== 'string' ? { text: entityTypeLabel(i.type) } : i.values.length ? null : { text: 'нет значений', warn: true }
      }
```

- тело `body`: вынести в компонент `EntityBody` в этом же файле, чтобы держать состояние подтверждения:

```tsx
function EntityBody({ d, patch }: { d: EntityListItem; patch: (p: Partial<EntityListItem>) => void }) {
  const [pending, setPending] = useState<EntityKind | null>(null);
  const kind: EntityKind = { type: d.type, range_min: d.range_min, range_max: d.range_max };
  const hasData = d.values.length > 0 || !!d.range_min || !!d.range_max;
  const apply = (next: EntityKind) => patch({ ...next, ...(next.type === 'string' ? {} : { values: [] }) });
  const change = (next: EntityKind) => {
    // Правка границ диапазона данные не теряет; смена типа — теряет значения или диапазон
    if (next.type !== d.type && hasData) setPending(next);
    else apply(next);
  };
  return (
    <>
      <DictCard title="Тип">
        <EntityTypeFields kind={kind} onChange={change} />
      </DictCard>
      {d.type === 'string' && <EntityValues values={d.values} onChange={(values) => patch({ values })} />}
      {/* существующий <label> с переключателем multiple_values остаётся без изменений */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Сменить тип?"
        description="Значения и диапазон, не подходящие новому типу, будут удалены."
        onConfirm={() => {
          if (pending) apply(pending);
          setPending(null);
        }}
      />
    </>
  );
}
```

  В `body={(d, patch) => <EntityBody d={d} patch={patch} />}`. Блок `<label ...><Switch .../>...</label>` из текущего `body` перенести внутрь `EntityBody` на место комментария. `EntityListItem` импортировать из `@/lib/types`.
- `onSave`: `await api.entities.save(d.id, { name: d.name, description: d.description, multiple_values: d.multiple_values, type: d.type, range_min: d.range_min, range_max: d.range_max, values: d.values });`
- Если у `ConfirmDialog` имена пропсов отличаются от `open/onOpenChange/title/description/onConfirm` — сверить с `web/src/components/ConfirmDialog.tsx`; в `DictionaryMaster.tsx` он вызывается ровно с этими именами.

- [ ] **Step 8: `ScenarioEntities`**

В `web/src/pages/scenarios/ScenarioEntities.tsx` у `<CreateDialog>` добавить `withType`, а `onCreate` заменить на:

```tsx
      onCreate={(name, kind) => {
        // CreateDialog сам закрывается после onCreate и ждёт синхронный обработчик
        const row = creatingFor;
        setCreatingFor(null);
        api.entities
          .create(projectId, name, kind)
```

(остальная цепочка `.then(...).catch(...)` без изменений).

- [ ] **Step 9: Проверка**

Run: `cd web && npx vitest run` → PASS.
Run: `npm run build -w web` → без ошибок типов. Типичные ошибки: `EntityListItem.type` приходит из `Entity`; фикстуры `Entity` в тестах web (если есть) требуют новых полей — добавить `type: 'string', range_min: '', range_max: ''`.

- [ ] **Step 10: Ручная проверка в браузере**

Запустить приложение (`npm run dev`), открыть демо-проект и проверить:
1. «Новая сущность»: выбор типа; для «Число», «Время», «Дата» появляются поля «От/До»; для «Логический» только подсказка; «30 → 15» блокирует создание.
2. Созданная сущность открывается на странице с выбранным типом; для строки виден список значений.
3. Смена типа у сущности со значениями спрашивает подтверждение; после подтверждения значения пропали.
4. В демо `TEMP_VALUE` — число 15–30, `TIME` — время 05:00–23:00, `ALARM_DATE` — дата, `ALARM_REPEAT` — логический; в списке у нестрок видна метка типа.
5. Быстрое создание сущности из сценария («Сущности сценария» → «Новая сущность») тоже даёт выбор типа.
6. Экспорт в Markdown содержит колонку «Тип» с диапазоном.

Если что-то не работает — сообщить, а не заявлять об успехе.

---

## Self-Review

- **Покрытие спеки:** данные и миграция — Task 1; API и валидация, очистка значений при смене типа — Task 1; диалог создания, быстрое создание из сценария, страница сущности, подтверждение смены типа, метка типа в списке — Task 3; экспорт (markdown и docx через общую `entitiesTable`) — Task 2; демо — Task 2; дамп/импорт и дублирование — тест в Task 2; тесты — во всех задачах.
- **Плейсхолдеров нет**, кроме двух осознанных ссылок на реальный код, который нужно сверить на месте (имя переменной markdown в `export.test.ts`; пропсы `ConfirmDialog`).
- **Согласованность имён:** `EntityKind`, `parseEntityKind`, `rangeText`/`rangeSummary`, `hasRange`, `rangeError`, `EntityTypeFields` используются одинаково во всех задачах.
