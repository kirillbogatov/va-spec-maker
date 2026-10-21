# Единые интенты, промпты и сущности: подключение к сценарию — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Интенты и промпты становятся проектными объектами, которые сценарий подключает связью (`scenario_intents`, `scenario_prompts`); у подключения интента есть флаг «глобальный»; редактирование остаётся в одном компоненте.

**Architecture:** Новые таблицы-связи + миграция существующих БД (`PRAGMA user_version` 0 → 1). Подключениями управляют отдельные запросы (`PUT/DELETE /scenarios/:sid/intents/:iid`, то же для промптов); `PUT /scenarios/:id` автоматически подключает то, на что ссылается. Глобальные переходы — строки `scenario_steps` с `kind = 'global'`. Экспорт строится по подключениям. Веб-часть: те же таблицы `IntentsTable`/`PromptsTable`, но показывают подключённые объекты, с переключателем «Глобальный», выбором существующего и «Убрать из сценария».

**Tech Stack:** TypeScript, sql.js (SQLite в браузере/Node), vitest, React + TanStack Query + base-ui, docx.

Спека: [docs/superpowers/specs/2026-10-21-unified-scenario-dictionary-design.md](../specs/2026-10-21-unified-scenario-dictionary-design.md).

## Global Constraints

- Весь пользовательский текст на русском; идентификаторы в коде на английском; комментарии на русском (как в окружающем коде).
- Подключениями управляют только `PUT/DELETE /api/scenarios/:sid/(intents|prompts)/:id`; `PUT /api/scenarios/:id` их не перезаписывает, а только добавляет недостающие.
- Нельзя отключить объект или снять `is_global`, пока в сценарии есть ссылки на него: ответ `409` с `error: 'in_use'`.
- Глобальный переход: `kind = 'global'`, `state = ''`, ответ ассистента и действие системы берутся из состояния-цели (в строке сбрасываются, как у `transition`).
- Строка ошибки без интента означает «по любому интенту»; в экспорте колонка «Запрос пользователя» показывает «Любой интент сценария».
- Старые колонки `intents.scenario_id`, `prompts.scenario_id`, `scenario_steps.any_intent` из новой схемы убираются; в существующих БД остаются нетронутыми и неиспользуемыми, миграция обнуляет `scenario_id`.
- `intent_entities.required` и `scenario_entities.required` не меняются.
- Каждая задача заканчивается зелёным `npm test` для затронутого пакета и коммитом.
- Коммиты: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` в конце сообщения.

> **Перед началом.** В рабочем дереве есть чужие незакоммиченные правки в файлах, которые трогает этот план (`core/src/demo.ts`, `core/src/export/tables.ts`, `core/src/routes/projects.ts`, `core/test/export.test.ts`, `core/test/projects.test.ts`, много файлов в `web/src`). `git add <файл>` захватит и их. Либо закоммитьте/спрячьте их до старта (рекомендуется), либо делайте коммиты задач через `git add -p`.

## Структура файлов

**Core — создать**
- `core/src/links.ts` — подключение/отключение интентов и промптов к сценарию, проверки.
- `core/test/migration.test.ts` — миграция БД.
- `core/test/links.test.ts` — подключения промптов и общие случаи (интентные тесты лежат в `intents.test.ts`).

**Core — изменить**
- `core/src/db.ts` — схема, `migrate()`.
- `core/src/routes/intents.ts`, `core/src/routes/prompts.ts` — списки с `scenarios`, подключение, отключение.
- `core/src/routes/entities.ts` — `used_by[].scenario_ids`.
- `core/src/routes/projects.ts` — критерий готовности.
- `core/src/routes/scenarios.ts` — `kind = 'global'`, автоподключение, без `any_intent`.
- `core/src/export/model.ts`, `tables.ts`, `markdown.ts`, `docx.ts` — экспорт по подключениям, глобальные переходы.
- `core/src/project-dump.ts` — новые таблицы, апгрейд старых дампов.
- `core/src/demo.ts` — без `any_intent`.
- Тесты: `intents`, `prompts`, `entities`, `scenarios`, `export`, `projects`.

**Web — создать**
- `web/src/pages/scenarios/GlobalTransitions.tsx` — блок глобальных переходов.

**Web — изменить**
- `web/src/lib/types.ts`, `api.ts`, `states.ts`, `states.test.ts`.
- `web/src/hooks/scenarioGroups.ts`.
- `web/src/pages/intents/IntentsPage.tsx`, `IntentsTable.tsx`; `web/src/pages/prompts/PromptsPage.tsx`, `PromptsTable.tsx`; `web/src/pages/entities/EntitiesPage.tsx`.
- `web/src/pages/scenarios/StepsTable.tsx`, `ScenarioForm.tsx`, `ScenarioChecks.tsx`, `ScenarioEntities.tsx`, `state-editor/EdgePanel.tsx`, `state-editor/StateEditor.tsx`.
- `web/src/components/CommandPalette.tsx`.

---

## Task 1: Таблицы-связи и миграция

**Files:**
- Modify: `core/src/db.ts`
- Create: `core/test/migration.test.ts`

**Interfaces:**
- Produces: таблицы `scenario_intents(id, scenario_id, intent_id, is_global, position)` и `scenario_prompts(id, scenario_id, prompt_id, position)`; `export function migrate(db: Db): void`; `openDb()` вызывает `migrate`.

На этом этапе старые колонки остаются в `SCHEMA` (их уберёт задача 8), чтобы весь код продолжал работать.

- [ ] **Step 1: Написать падающий тест**

Создать `core/test/migration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/db';
import type { Db } from '../src/sqlite';
import { createProject } from './helpers';

const hasColumn = (db: Db, table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);

/** Приводит свежую БД к виду до миграции: старые колонки и user_version = 0. */
function makeLegacy(db: Db) {
  if (!hasColumn(db, 'intents', 'scenario_id')) db.exec('ALTER TABLE intents ADD COLUMN scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE');
  if (!hasColumn(db, 'prompts', 'scenario_id')) db.exec('ALTER TABLE prompts ADD COLUMN scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE');
  if (!hasColumn(db, 'scenario_steps', 'any_intent')) db.exec('ALTER TABLE scenario_steps ADD COLUMN any_intent INTEGER NOT NULL DEFAULT 0');
  db.exec('DELETE FROM scenario_intents; DELETE FROM scenario_prompts; PRAGMA user_version = 0');
}

const userVersion = (db: Db) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const links = (db: Db, table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, number>[];

describe('migrate', () => {
  it('stamps a fresh database with version 1', async () => {
    const db = await openDb();
    expect(userVersion(db)).toBe(1);
  });

  it('turns ownership and usage into connections, and any_intent transitions into errors', async () => {
    const db = await openDb();
    makeLegacy(db);
    const pid = createProject(db);
    const run = (sql: string, ...p: unknown[]) => Number(db.prepare(sql).run(...p).lastInsertRowid);
    const s1 = run('INSERT INTO scenarios(project_id, name) VALUES (?, ?)', pid, 'S1');
    const s2 = run('INSERT INTO scenarios(project_id, name) VALUES (?, ?)', pid, 'S2');
    const own = run('INSERT INTO intents(project_id, name, scenario_id) VALUES (?, ?, ?)', pid, 'INT_OWN', s1);
    const used = run('INSERT INTO intents(project_id, name) VALUES (?, ?)', pid, 'INT_USED');
    const free = run('INSERT INTO intents(project_id, name) VALUES (?, ?)', pid, 'INT_FREE');
    const pOwn = run('INSERT INTO prompts(project_id, name, scenario_id) VALUES (?, ?, ?)', pid, 'PRM_OWN', s1);
    const pState = run('INSERT INTO prompts(project_id, name) VALUES (?, ?)', pid, 'PRM_STATE');
    run('INSERT INTO scenario_steps(scenario_id, kind, state, intent_id) VALUES (?, ?, ?, ?)', s2, 'transition', 'A', used);
    run('INSERT INTO scenario_steps(scenario_id, kind, state, any_intent) VALUES (?, ?, ?, 1)', s1, 'transition', 'B');
    run('INSERT INTO scenario_states(scenario_id, name, prompt_id) VALUES (?, ?, ?)', s2, 'ST', pState);

    migrate(db);

    expect(links(db, 'scenario_intents').map((l) => [l.scenario_id, l.intent_id, l.is_global])).toEqual([[s1, own, 0], [s2, used, 0]]);
    expect(links(db, 'scenario_prompts').map((l) => [l.scenario_id, l.prompt_id])).toEqual([[s1, pOwn], [s2, pState]]);
    expect(db.prepare('SELECT scenario_id FROM intents WHERE scenario_id IS NOT NULL').all()).toEqual([]);
    expect(db.prepare('SELECT scenario_id FROM prompts WHERE scenario_id IS NOT NULL').all()).toEqual([]);
    expect(db.prepare("SELECT kind FROM scenario_steps WHERE state = 'B'").get()).toEqual({ kind: 'error' });
    expect(db.prepare('SELECT 1 FROM scenario_intents WHERE intent_id = ?').get(free)).toBeUndefined();
    expect(userVersion(db)).toBe(1);
  });

  it('is idempotent and leaves intents alive when their scenario is deleted', async () => {
    const db = await openDb();
    makeLegacy(db);
    const pid = createProject(db);
    const s1 = Number(db.prepare('INSERT INTO scenarios(project_id, name) VALUES (?, ?)').run(pid, 'S1').lastInsertRowid);
    db.prepare('INSERT INTO intents(project_id, name, scenario_id) VALUES (?, ?, ?)').run(pid, 'INT_OWN', s1);
    migrate(db);
    const before = links(db, 'scenario_intents');
    db.exec('PRAGMA user_version = 0');
    migrate(db);
    expect(links(db, 'scenario_intents')).toEqual(before);
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(s1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM intents').get()).toEqual({ n: 1 });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -w core -- migration`
Expected: FAIL — `migrate` не экспортируется из `../src/db` (и/или таблицы `scenario_intents` нет).

- [ ] **Step 3: Реализовать**

В `core/src/db.ts` после таблицы `scenario_entities` (перед `scenario_states`) добавить в `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS scenario_intents (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  is_global INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (scenario_id, intent_id)
);
CREATE TABLE IF NOT EXISTS scenario_prompts (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (scenario_id, prompt_id)
);
```

Заменить `openDb` и добавить `migrate` (в конце файла):

```ts
const hasColumn = (db: Db, table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);

/**
 * Версия 1: интенты и промпты подключаются к сценариям связями, а не принадлежат им.
 * Старые колонки не удаляются (SQLite не умеет без пересоздания таблицы, а оно каскадно сотрёт связанные строки),
 * но обнуляются, чтобы удаление сценария не уносило интенты.
 */
export function migrate(db: Db): void {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version >= 1) return;
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

export async function openDb(opts: OpenOpts = {}): Promise<Db> {
  const db = await openSqlite(opts);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
```

(Старый `openDb` в конце файла удалить.)

- [ ] **Step 4: Убедиться, что тест проходит, и весь core зелёный**

Run: `npm test -w core`
Expected: PASS (все существующие тесты тоже: старый код продолжает работать со старыми колонками).

- [ ] **Step 5: Commit**

```bash
git add core/src/db.ts core/test/migration.test.ts
git commit -m "feat(core): scenario_intents/scenario_prompts tables and v1 migration"
```

---

## Task 2: Подключение интентов к сценарию

**Files:**
- Create: `core/src/links.ts`
- Modify: `core/src/routes/intents.ts`
- Test: `core/test/intents.test.ts`

**Interfaces:**
- Produces (`core/src/links.ts`):
  - `type LinkKind = 'intent' | 'prompt'`
  - `connect(db: Db, kind: LinkKind, scenarioId: number, id: number): void` — подключает, если ещё нет (флаг `is_global` не трогает).
  - `assertSameProject(db: Db, kind: LinkKind, scenarioId: number, id: number): void` — 404, если сценария/объекта нет или они из разных проектов.
  - `disconnect(db: Db, kind: LinkKind, scenarioId: number, id: number): void` — 404 если не подключён, 409 `in_use`, если на объект есть ссылки в сценарии.
  - `setGlobal(db: Db, scenarioId: number, intentId: number, isGlobal: boolean): void` — 409 `in_use`, если снимают флаг при существующих глобальных переходах.
- Produces (HTTP): `GET /api/projects/:pid/intents` и `GET /api/scenarios/:sid/intents` возвращают `{ id, name, enabled, phrase_count, scenarios: {id,name}[] }`, во втором ещё `is_global: boolean`; `PUT /api/scenarios/:sid/intents/:iid` (тело `{ is_global?: boolean }`) → `{ id, is_global }`; `DELETE /api/scenarios/:sid/intents/:iid` → 204.

- [ ] **Step 1: Обновить и дописать тесты**

В `core/test/intents.test.ts` в тесте `creates an intent and lists it with phrase count` заменить ожидание списка:

```ts
    expect(list.body).toEqual([{ id: c.body.id, name: 'INT_SEAT_HEATING', enabled: true, phrase_count: 0, scenarios: [] }]);
```

Дописать в конец `describe('intents API', ...)` (перед закрывающей `});`):

```ts
  async function twoScenarios() {
    const ctx = await setup();
    const mk = async (name: string) => (await request(ctx.app).post(`/api/projects/${ctx.pid}/scenarios`).send({ name })).body.id as number;
    return { ...ctx, s1: await mk('S1'), s2: await mk('S2') };
  }

  it('connects one intent to several scenarios and lists them', async () => {
    const { app, pid, s1, s2 } = await twoScenarios();
    const a = await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' });
    const put = await request(app).put(`/api/scenarios/${s2}/intents/${a.body.id}`).send({});
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ id: a.body.id, is_global: false });
    const list = (await request(app).get(`/api/projects/${pid}/intents`)).body;
    expect(list[0].scenarios).toEqual([{ id: s1, name: 'S1' }, { id: s2, name: 'S2' }]);
    expect((await request(app).get(`/api/scenarios/${s2}/intents`)).body[0]).toMatchObject({ name: 'INT_A', is_global: false });
  });

  it('keeps the global flag per scenario', async () => {
    const { app, s1, s2 } = await twoScenarios();
    const a = await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' });
    await request(app).put(`/api/scenarios/${s1}/intents/${a.body.id}`).send({ is_global: true });
    await request(app).put(`/api/scenarios/${s2}/intents/${a.body.id}`).send({});
    expect((await request(app).get(`/api/scenarios/${s1}/intents`)).body[0].is_global).toBe(true);
    expect((await request(app).get(`/api/scenarios/${s2}/intents`)).body[0].is_global).toBe(false);
  });

  it('refuses to disconnect an intent that rows still use, and to un-global one with global rows', async () => {
    const { app, db, s1 } = await twoScenarios();
    const a = (await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' })).body.id as number;
    const row = Number(db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'transition', a).lastInsertRowid);
    const refused = await request(app).delete(`/api/scenarios/${s1}/intents/${a}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('in_use');
    db.prepare('DELETE FROM scenario_steps WHERE id = ?').run(row);
    expect((await request(app).delete(`/api/scenarios/${s1}/intents/${a}`)).status).toBe(204);
    expect((await request(app).get(`/api/scenarios/${s1}/intents`)).body).toEqual([]);
    expect((await request(app).delete(`/api/scenarios/${s1}/intents/${a}`)).status).toBe(404);

    await request(app).put(`/api/scenarios/${s1}/intents/${a}`).send({ is_global: true });
    db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'global', a);
    const unglobal = await request(app).put(`/api/scenarios/${s1}/intents/${a}`).send({ is_global: false });
    expect(unglobal.status).toBe(409);
    expect((await request(app).get(`/api/scenarios/${s1}/intents`)).body[0].is_global).toBe(true);
  });

  it('does not connect an intent of another project', async () => {
    const { app, db, s1 } = await twoScenarios();
    const foreign = await request(app).post(`/api/projects/${createProject(db, 'Other')}/intents`).send({ name: 'X' });
    expect((await request(app).put(`/api/scenarios/${s1}/intents/${foreign.body.id}`).send({})).status).toBe(404);
    expect((await request(app).put(`/api/scenarios/999/intents/${foreign.body.id}`).send({})).status).toBe(404);
  });

  it('deleting an intent removes its global rows', async () => {
    const { app, db, s1 } = await twoScenarios();
    const a = (await request(app).post(`/api/scenarios/${s1}/intents`).send({ name: 'INT_A' })).body.id as number;
    db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'global', a);
    db.prepare('INSERT INTO scenario_steps(scenario_id, kind, intent_id) VALUES (?, ?, ?)').run(s1, 'transition', a);
    await request(app).delete(`/api/intents/${a}`);
    expect(db.prepare('SELECT kind FROM scenario_steps').all()).toEqual([{ kind: 'transition' }]);
  });
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w core -- intents`
Expected: FAIL (список без `scenarios`, нет маршрутов подключения).

- [ ] **Step 3: Создать `core/src/links.ts`**

```ts
import { HttpError, notFound } from './errors';
import type { Db } from './sqlite';

export type LinkKind = 'intent' | 'prompt';

const LINK = {
  intent: { table: 'scenario_intents', col: 'intent_id', of: 'intents', what: 'Интент' },
  prompt: { table: 'scenario_prompts', col: 'prompt_id', of: 'prompts', what: 'Промпт' },
} as const;

/** Подключает объект проекта к сценарию; уже подключённый не меняется (флаг is_global сохраняется). */
export function connect(db: Db, kind: LinkKind, scenarioId: number, id: number): void {
  const l = LINK[kind];
  const next = (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM ${l.table} WHERE scenario_id = ?`).get(scenarioId) as { n: number }).n;
  db.prepare(`INSERT OR IGNORE INTO ${l.table}(scenario_id, ${l.col}, position) VALUES (?, ?, ?)`).run(scenarioId, id, next);
}

/** Сценарий и объект должны существовать и быть из одного проекта; чужой объект считается ненайденным. */
export function assertSameProject(db: Db, kind: LinkKind, scenarioId: number, id: number): void {
  const l = LINK[kind];
  const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(scenarioId) as { project_id: number } | undefined;
  if (!s) throw notFound('Сценарий');
  const o = db.prepare(`SELECT project_id FROM ${l.of} WHERE id = ?`).get(id) as { project_id: number } | undefined;
  if (!o || o.project_id !== s.project_id) throw notFound(l.what);
}

/** Сколько строк и состояний сценария ссылаются на объект. */
function usesInScenario(db: Db, kind: LinkKind, scenarioId: number, id: number): number {
  const count = (sql: string) => (db.prepare(sql).get(scenarioId, id) as { n: number }).n;
  if (kind === 'intent') return count('SELECT COUNT(*) AS n FROM scenario_steps WHERE scenario_id = ? AND intent_id = ?');
  return (
    count('SELECT COUNT(*) AS n FROM scenario_steps WHERE scenario_id = ? AND prompt_id = ?') +
    count('SELECT COUNT(*) AS n FROM scenario_states WHERE scenario_id = ? AND prompt_id = ?')
  );
}

/** Отключает объект от сценария, если в сценарии на него больше нет ссылок. */
export function disconnect(db: Db, kind: LinkKind, scenarioId: number, id: number): void {
  const l = LINK[kind];
  if (!db.prepare(`SELECT 1 FROM ${l.table} WHERE scenario_id = ? AND ${l.col} = ?`).get(scenarioId, id)) {
    throw new HttpError(404, 'not_found', 'Объект не подключён к сценарию');
  }
  const uses = usesInScenario(db, kind, scenarioId, id);
  if (uses) {
    throw new HttpError(409, 'in_use', `${l.what} используется в сценарии (${uses}) — сначала уберите его из шагов`, { uses });
  }
  db.prepare(`DELETE FROM ${l.table} WHERE scenario_id = ? AND ${l.col} = ?`).run(scenarioId, id);
}

/** Меняет флаг «глобальный» у подключённого интента; снять его нельзя, пока есть глобальные переходы. */
export function setGlobal(db: Db, scenarioId: number, intentId: number, isGlobal: boolean): void {
  if (!isGlobal) {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM scenario_steps WHERE scenario_id = ? AND intent_id = ? AND kind = 'global'").get(scenarioId, intentId) as { n: number }).n;
    if (n) throw new HttpError(409, 'in_use', `У интента есть глобальные переходы (${n}) — сначала удалите их`, { uses: n });
  }
  db.prepare('UPDATE scenario_intents SET is_global = ? WHERE scenario_id = ? AND intent_id = ?').run(isGlobal ? 1 : 0, scenarioId, intentId);
}
```

- [ ] **Step 4: Переписать `core/src/routes/intents.ts`**

Заменить `import`-блок и всё до `r.get('/intents/:id'`:

```ts
import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { badRequest, notFound } from '../errors';
import { assertSameProject, connect, disconnect, setGlobal } from '../links';
import { assertUniqueName } from '../unique';
import { cleanStrings, optString, parseId, requireString } from '../validate';

interface IntentRow {
  id: number; project_id: number; name: string; enabled: number; comment: string;
}

export function intentsRouter(db: Db): RouterT {
  const r = Router();

  const load = (id: number) => {
    const row = db
      .prepare('SELECT id, project_id, name, enabled, comment FROM intents WHERE id = ?')
      .get(id) as IntentRow | undefined;
    if (!row) throw notFound('Интент');
    return {
      ...row,
      enabled: !!row.enabled,
      phrases: (db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(id) as { text: string }[]).map((p) => p.text),
      entities: (db.prepare('SELECT entity_id, required FROM intent_entities WHERE intent_id = ? ORDER BY position, id').all(id) as { entity_id: number; required: number }[])
        .map((e) => ({ entity_id: e.entity_id, required: !!e.required })),
    };
  };

  const scenariosOf = (id: number) =>
    db
      .prepare('SELECT s.id, s.name FROM scenario_intents si JOIN scenarios s ON s.id = si.scenario_id WHERE si.intent_id = ? ORDER BY s.id')
      .all(id) as { id: number; name: string }[];

  type ListRow = { id: number; name: string; enabled: number; phrase_count: number; is_global?: number };
  const decorate = (rows: ListRow[]) =>
    rows.map(({ is_global, ...x }) => ({
      ...x,
      enabled: !!x.enabled,
      ...(is_global === undefined ? {} : { is_global: !!is_global }),
      scenarios: scenariosOf(x.id),
    }));

  const PHRASES = '(SELECT COUNT(*) FROM intent_phrases p WHERE p.intent_id = i.id)';

  r.get('/projects/:pid/intents', (req, res) => {
    const rows = db
      .prepare(`SELECT i.id, i.name, i.enabled, ${PHRASES} AS phrase_count FROM intents i WHERE i.project_id = ? ORDER BY i.name`)
      .all(parseId(req.params.pid)) as ListRow[];
    res.json(decorate(rows));
  });

  /** Интенты, подключённые к сценарию, в порядке подключения. */
  r.get('/scenarios/:sid/intents', (req, res) => {
    const rows = db
      .prepare(
        `SELECT i.id, i.name, i.enabled, si.is_global, ${PHRASES} AS phrase_count
         FROM scenario_intents si JOIN intents i ON i.id = si.intent_id
         WHERE si.scenario_id = ? ORDER BY si.position, si.id`,
      )
      .all(parseId(req.params.sid)) as ListRow[];
    res.json(decorate(rows));
  });

  const create = (pid: number, body: any) => {
    const name = requireString(body?.name, 'Название');
    assertUniqueName(db, 'intents', pid, name, 'Интент');
    const info = db.prepare('INSERT INTO intents(project_id, name) VALUES (?, ?)').run(pid, name);
    return { id: Number(info.lastInsertRowid), name };
  };

  r.post('/projects/:pid/intents', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    res.status(201).json(create(pid, req.body));
  });

  /** Создаёт интент в проекте и сразу подключает его к сценарию. */
  r.post('/scenarios/:sid/intents', (req, res) => {
    const sid = parseId(req.params.sid);
    const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(sid) as { project_id: number } | undefined;
    if (!s) throw notFound('Сценарий');
    const created = db.transaction(() => {
      const c = create(s.project_id, req.body);
      connect(db, 'intent', sid, c.id);
      return c;
    })();
    res.status(201).json(created);
  });

  /** Подключает существующий интент (если ещё не подключён) и, если передан is_global, меняет флаг. */
  r.put('/scenarios/:sid/intents/:iid', (req, res) => {
    const sid = parseId(req.params.sid);
    const iid = parseId(req.params.iid);
    assertSameProject(db, 'intent', sid, iid);
    db.transaction(() => {
      connect(db, 'intent', sid, iid);
      if (typeof req.body?.is_global === 'boolean') setGlobal(db, sid, iid, req.body.is_global);
    })();
    const row = db.prepare('SELECT is_global FROM scenario_intents WHERE scenario_id = ? AND intent_id = ?').get(sid, iid) as { is_global: number };
    res.json({ id: iid, is_global: !!row.is_global });
  });

  r.delete('/scenarios/:sid/intents/:iid', (req, res) => {
    disconnect(db, 'intent', parseId(req.params.sid), parseId(req.params.iid));
    res.status(204).end();
  });

```

В обработчике `r.delete('/intents/:id', ...)` перед удалением интента добавить строку:

```ts
    db.prepare("DELETE FROM scenario_steps WHERE kind = 'global' AND intent_id = ?").run(id);
```

(`load(id);` остаётся перед ней.) `r.get('/intents/:id')` и `r.put('/intents/:id')` оставить без изменений.

- [ ] **Step 5: Прогнать тесты**

Run: `npm test -w core -- intents`
Expected: PASS. Затем `npm test -w core` — PASS (старые тесты на `scenarios`/`export` не зависят от формы списка интентов).

- [ ] **Step 6: Commit**

```bash
git add core/src/links.ts core/src/routes/intents.ts core/test/intents.test.ts
git commit -m "feat(core): connect intents to scenarios with a per-scenario global flag"
```

---

## Task 3: Подключение промптов к сценарию

**Files:**
- Modify: `core/src/routes/prompts.ts`
- Test: `core/test/prompts.test.ts`

**Interfaces:**
- Consumes: `connect`, `assertSameProject`, `disconnect` из `core/src/links.ts` (задача 2).
- Produces (HTTP): `GET /api/projects/:pid/prompts` и `GET /api/scenarios/:sid/prompts` → `{ id, name, has_answer, step_count, scenarios: {id,name}[] }`; `POST /api/scenarios/:sid/prompts` создаёт и подключает; `PUT /api/scenarios/:sid/prompts/:pid` подключает → `{ id }`; `DELETE /api/scenarios/:sid/prompts/:pid` → 204.

- [ ] **Step 1: Обновить тесты**

В `core/test/prompts.test.ts` заменить ожидание списка в первом тесте:

```ts
    expect((await request(app).get(`/api/projects/${pid}/prompts`)).body).toEqual([
      { id: c.body.id, name: 'PRM_TEMPERATURE_SET', scenarios: [], has_answer: expect.any(Boolean), step_count: 0 },
    ]);
```

Дописать в конец `describe` (перед `});`):

```ts
  it('connects one prompt to several scenarios and refuses to disconnect it while rows use it', async () => {
    const { app, pid } = await setup();
    const mk = async (name: string) => (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name })).body.id as number;
    const [s1, s2] = [await mk('S1'), await mk('S2')];
    const p = (await request(app).post(`/api/scenarios/${s1}/prompts`).send({ name: 'PRM_A' })).body.id as number;
    expect((await request(app).put(`/api/scenarios/${s2}/prompts/${p}`).send({})).body).toEqual({ id: p });
    expect((await request(app).get(`/api/projects/${pid}/prompts`)).body[0].scenarios).toEqual([{ id: s1, name: 'S1' }, { id: s2, name: 'S2' }]);

    await request(app).put(`/api/scenarios/${s1}`).send({
      name: 'S1', parts: [{ steps: [{ kind: 'error', state: 'A', prompt_id: p }] }],
    });
    const refused = await request(app).delete(`/api/scenarios/${s1}/prompts/${p}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('in_use');
    expect((await request(app).delete(`/api/scenarios/${s2}/prompts/${p}`)).status).toBe(204);
    expect((await request(app).get(`/api/scenarios/${s2}/prompts`)).body).toEqual([]);
    expect((await request(app).get(`/api/prompts/${p}`)).status).toBe(200);
  });
```

Тест опирается на автоподключение и поведение `PUT /scenarios/:id` из задачи 5 только в части `prompt_id` строки — он уже работает на текущем коде (строка ссылается на промпт, подключение `s1` создано через `POST /scenarios/:sid/prompts`).

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w core -- prompts`
Expected: FAIL.

- [ ] **Step 3: Переписать `core/src/routes/prompts.ts`**

Весь файл целиком:

```ts
import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { notFound } from '../errors';
import { assertSameProject, connect, disconnect } from '../links';
import { assertUniqueName } from '../unique';
import { cleanStrings, parseId, requireString } from '../validate';

interface PromptRow { id: number; project_id: number; name: string; full_answers: string; short_answers: string }

/** Сколько раз промпт выбран в строках таблиц (ошибки) и в состояниях схемы. */
const USES = `((SELECT COUNT(*) FROM scenario_steps t WHERE t.prompt_id = prompts.id) + (SELECT COUNT(*) FROM scenario_states st WHERE st.prompt_id = prompts.id))`;

export function promptsRouter(db: Db): RouterT {
  const r = Router();

  const load = (id: number) => {
    const p = db
      .prepare('SELECT id, project_id, name, full_answers, short_answers FROM prompts WHERE id = ?')
      .get(id) as PromptRow | undefined;
    if (!p) throw notFound('Промпт');
    return { ...p, full_answers: JSON.parse(p.full_answers) as string[], short_answers: JSON.parse(p.short_answers) as string[] };
  };

  const scenariosOf = (id: number) =>
    db
      .prepare('SELECT s.id, s.name FROM scenario_prompts sp JOIN scenarios s ON s.id = sp.scenario_id WHERE sp.prompt_id = ? ORDER BY s.id')
      .all(id) as { id: number; name: string }[];

  const listRows = (rows: unknown[]) =>
    (rows as { id: number; has_answer: number }[]).map((r) => ({ ...r, has_answer: !!r.has_answer, scenarios: scenariosOf(r.id) }));

  const create = (pid: number, body: any) => {
    const name = requireString(body?.name, 'Название');
    assertUniqueName(db, 'prompts', pid, name, 'Промпт');
    const info = db.prepare('INSERT INTO prompts(project_id, name) VALUES (?, ?)').run(pid, name);
    return { id: Number(info.lastInsertRowid), name };
  };

  r.get('/projects/:pid/prompts', (req, res) => {
    const pid = parseId(req.params.pid);
    res.json(listRows(db.prepare(`SELECT id, name, full_answers <> '[]' AS has_answer, ${USES} AS step_count FROM prompts WHERE project_id = ? ORDER BY id`).all(pid)));
  });

  /** Промпты, подключённые к сценарию, в порядке подключения. */
  r.get('/scenarios/:sid/prompts', (req, res) => {
    const sid = parseId(req.params.sid);
    res.json(
      listRows(
        db
          .prepare(
            `SELECT prompts.id, prompts.name, prompts.full_answers <> '[]' AS has_answer, ${USES} AS step_count
             FROM scenario_prompts sp JOIN prompts ON prompts.id = sp.prompt_id
             WHERE sp.scenario_id = ? ORDER BY sp.position, sp.id`,
          )
          .all(sid),
      ),
    );
  });

  r.post('/projects/:pid/prompts', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    res.status(201).json(create(pid, req.body));
  });

  /** Создаёт промпт в проекте и сразу подключает его к сценарию. */
  r.post('/scenarios/:sid/prompts', (req, res) => {
    const sid = parseId(req.params.sid);
    const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(sid) as { project_id: number } | undefined;
    if (!s) throw notFound('Сценарий');
    const created = db.transaction(() => {
      const c = create(s.project_id, req.body);
      connect(db, 'prompt', sid, c.id);
      return c;
    })();
    res.status(201).json(created);
  });

  r.put('/scenarios/:sid/prompts/:pid', (req, res) => {
    const sid = parseId(req.params.sid);
    const pid = parseId(req.params.pid);
    assertSameProject(db, 'prompt', sid, pid);
    connect(db, 'prompt', sid, pid);
    res.json({ id: pid });
  });

  r.delete('/scenarios/:sid/prompts/:pid', (req, res) => {
    disconnect(db, 'prompt', parseId(req.params.sid), parseId(req.params.pid));
    res.status(204).end();
  });

  r.get('/prompts/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/prompts/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    assertUniqueName(db, 'prompts', cur.project_id, requireString(b.name, 'Название'), 'Промпт', id);
    db.prepare('UPDATE prompts SET name = ?, full_answers = ?, short_answers = ? WHERE id = ?').run(
      requireString(b.name, 'Название'), JSON.stringify(cleanStrings(b.full_answers)),
      JSON.stringify(cleanStrings(b.short_answers)), id,
    );
    res.json(load(id));
  });

  r.delete('/prompts/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npm test -w core`
Expected: PASS. (Тест «stores description, response and action on a state…» ждёт пустой `GET /scenarios/:id/prompts` — он остаётся зелёным, пока автоподключения нет; его обновит задача 5.)

- [ ] **Step 5: Commit**

```bash
git add core/src/routes/prompts.ts core/test/prompts.test.ts
git commit -m "feat(core): connect prompts to scenarios"
```

---

## Task 4: Сущности (`used_by`) и готовность проекта

**Files:**
- Modify: `core/src/routes/entities.ts`, `core/src/routes/projects.ts`
- Test: `core/test/entities.test.ts`, `core/test/projects.test.ts`

**Interfaces:**
- Produces: `used_by` сущности — `{ id, name, scenario_ids: number[] }[]` (вместо `scenario_id`); `ready_count` проекта считается по подключениям.

- [ ] **Step 1: Обновить тесты**

В `core/test/entities.test.ts` строка 57 — заменить ожидание:

```ts
    expect(refused.body.details.intents).toEqual([{ id: Number(intent.lastInsertRowid), name: 'Вернуться', scenario_ids: [] }]);
```

В `core/test/projects.test.ts` в `describe('projects API', ...)` перед закрывающей `});` добавить:

```ts
  it('counts a scenario as ready from its connected intents and prompts', async () => {
    const { app } = await makeApp();
    const pid = await mk(app, 'P');
    const ready = async () => (await request(app).get('/api/projects')).body[0].ready_count as number;
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
    const intent = (await request(app).post(`/api/scenarios/${sid}/intents`).send({ name: 'INT_A' })).body.id as number;
    const prompt = (await request(app).post(`/api/scenarios/${sid}/prompts`).send({ name: 'PRM_A' })).body.id as number;
    await request(app).put(`/api/scenarios/${sid}`).send({
      name: 'S', description: 'Описание', parts: [{ steps: [{ kind: 'transition', state: 'A', intent_id: intent, next_states: 'B' }] }],
    });
    expect(await ready()).toBe(0); // у интента нет фраз, у промпта нет ответа
    await request(app).put(`/api/intents/${intent}`).send({ name: 'INT_A', phrases: ['привет'] });
    expect(await ready()).toBe(0);
    await request(app).put(`/api/prompts/${prompt}`).send({ name: 'PRM_A', full_answers: ['Готово'] });
    expect(await ready()).toBe(1);
  });
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w core -- entities projects`
Expected: FAIL (`scenario_id` вместо `scenario_ids`; готовность считается по `scenario_id`).

- [ ] **Step 3: Реализовать**

В `core/src/routes/entities.ts` заменить `usedBy`:

```ts
  const usedBy = (id: number) =>
    (
      db
        .prepare(
          `SELECT DISTINCT i.id, i.name FROM intent_entities ie
           JOIN intents i ON i.id = ie.intent_id WHERE ie.entity_id = ? ORDER BY i.name`,
        )
        .all(id) as { id: number; name: string }[]
    ).map((i) => ({
      ...i,
      scenario_ids: (db.prepare('SELECT scenario_id FROM scenario_intents WHERE intent_id = ? ORDER BY scenario_id').all(i.id) as { scenario_id: number }[]).map((r) => r.scenario_id),
    }));
```

В `core/src/routes/projects.ts` заменить три условия `ready_count` (строки с `i.scenario_id` / `pr.scenario_id`):

```sql
                     AND EXISTS (SELECT 1 FROM scenario_intents si WHERE si.scenario_id = s.id)
                     AND NOT EXISTS (SELECT 1 FROM scenario_intents si JOIN intents i ON i.id = si.intent_id
                                       WHERE si.scenario_id = s.id AND i.enabled = 1
                                         AND NOT EXISTS (SELECT 1 FROM intent_phrases f WHERE f.intent_id = i.id))
                     AND NOT EXISTS (SELECT 1 FROM scenario_prompts sp JOIN prompts pr ON pr.id = sp.prompt_id
                                       WHERE sp.scenario_id = s.id AND pr.full_answers = '[]')
```

(Остальные условия — описание, зависимости, наличие перехода — не трогать.)

- [ ] **Step 4: Прогнать**

Run: `npm test -w core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/routes/entities.ts core/src/routes/projects.ts core/test/entities.test.ts core/test/projects.test.ts
git commit -m "feat(core): entity usage and project readiness from scenario connections"
```

---

## Task 5: Сохранение сценария: глобальные строки, автоподключение, без `any_intent`

**Files:**
- Modify: `core/src/routes/scenarios.ts`
- Test: `core/test/scenarios.test.ts`

**Interfaces:**
- Consumes: `connect` из `core/src/links.ts`.
- Produces: шаги сценария без поля `any_intent`; `kind: 'transition' | 'error' | 'global'`; `PUT /api/scenarios/:id` подключает интенты/промпты, на которые ссылаются сохраняемые данные, и отвергает (400) глобальный переход с интентом, не подключённым как глобальный.

- [ ] **Step 1: Обновить и дописать тесты**

В `core/test/scenarios.test.ts`:

1. В тесте `PUT replaces rows, keeps their order and kind` из объекта `row` удалить `any_intent: false,`.
2. Тест `stores "any intent of the scenario" and drops the intent id` удалить целиком.
3. В тесте `stores description, response and action on a state…` строку
   `expect((await request(app).get(`/api/scenarios/${c.body.id}/prompts`)).body).toEqual([]);`
   заменить на:
   ```ts
    expect((await request(app).get(`/api/scenarios/${c.body.id}/prompts`)).body.map((p: any) => p.name)).toEqual(['PRM_ON']);
   ```
4. В тесте `deletes a scenario` перед `expect(... .delete ...)` оставить как есть, а новый тест добавить ниже.
5. Дописать перед последним `});`:

```ts
  it('connects what the saved rows and states reference', async () => {
    const { app, pid, intentId } = await setup();
    const pr = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM_ON' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    await request(app).put(`/api/scenarios/${c.body.id}`).send({
      name: 'S',
      parts: [{
        steps: [{ kind: 'transition', state: 'A', intent_id: intentId, next_states: 'B' }],
        layout: { B: { x: 0, y: 0, prompt_id: pr.body.id } },
      }],
    });
    const intents = (await request(app).get(`/api/scenarios/${c.body.id}/intents`)).body;
    expect(intents).toMatchObject([{ id: intentId, is_global: false }]);
    expect((await request(app).get(`/api/scenarios/${c.body.id}/prompts`)).body.map((p: any) => p.id)).toEqual([pr.body.id]);
    // повторное сохранение не дублирует и не сбрасывает флаг
    await request(app).put(`/api/scenarios/${c.body.id}/intents/${intentId}`).send({ is_global: true });
    await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S' });
    expect((await request(app).get(`/api/scenarios/${c.body.id}/intents`)).body).toMatchObject([{ id: intentId, is_global: true }]);
  });

  it('stores global rows only for global intents of the scenario', async () => {
    const { app, pid, intentId } = await setup();
    const pr = await request(app).post(`/api/projects/${pid}/prompts`).send({ name: 'PRM_BYE' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const global = { kind: 'global', state: 'ignored', intent_id: intentId, prompt_id: pr.body.id, system_action: 'x', next_states: 'ST_END' };
    const save = () => request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [{ steps: [global] }] });
    expect((await save()).status).toBe(400);
    await request(app).put(`/api/scenarios/${c.body.id}/intents/${intentId}`).send({ is_global: true });
    const ok = await save();
    expect(ok.status).toBe(200);
    expect(ok.body.parts[0].steps[0]).toMatchObject({ kind: 'global', state: '', intent_id: intentId, prompt_id: null, system_action: '', next_states: 'ST_END' });
    expect(ok.body.parts[0].steps[0]).not.toHaveProperty('any_intent');
    expect((await request(app).delete(`/api/scenarios/${c.body.id}/intents/${intentId}`)).status).toBe(409);
    // черновая строка без интента допустима
    const draft = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S', parts: [{ steps: [{ kind: 'global' }] }] });
    expect(draft.status).toBe(200);
    expect(draft.body.parts[0].steps[0]).toMatchObject({ kind: 'global', intent_id: null });
  });

  it('deleting a scenario keeps its intents and prompts in the project', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const i = await request(app).post(`/api/scenarios/${c.body.id}/intents`).send({ name: 'INT_KEEP' });
    const p = await request(app).post(`/api/scenarios/${c.body.id}/prompts`).send({ name: 'PRM_KEEP' });
    expect((await request(app).delete(`/api/scenarios/${c.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/intents/${i.body.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/prompts/${p.body.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/projects/${pid}/intents`)).body.find((x: any) => x.id === i.body.id).scenarios).toEqual([]);
  });
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w core -- scenarios`
Expected: FAIL (нет `kind: 'global'`, автоподключения).

- [ ] **Step 3: Реализовать в `core/src/routes/scenarios.ts`**

1. Импорт после существующих:
   ```ts
   import { connect } from '../links';
   ```
2. В `loadPart` запрос и маппинг:
   ```ts
          `SELECT kind, state, intent_id, request_params, condition, conditions, prompt_id, system_action, next_states
           FROM scenario_steps WHERE part_id = ? ORDER BY position, id`,
        )
        .all(part.id) as { conditions: string }[]
    ).map((t) => ({ ...t, conditions: JSON.parse(t.conditions) as StepCondition[] }));
   ```
3. Рядом с `findIntent`/`findPrompt` добавить:
   ```ts
    const isGlobalIntent = db.prepare('SELECT 1 FROM scenario_intents WHERE scenario_id = ? AND intent_id = ? AND is_global = 1');
   ```
4. В `steps = ...map((s: any) => ({` заменить три поля:
   ```ts
        kind: s?.kind === 'error' || s?.kind === 'global' ? s.kind : 'transition',
        state: optString(s?.state).trim(),
        intent_id: s?.intent_id == null ? null : parseId(s.intent_id),
   ```
   (строку `any_intent: s?.any_intent ? 1 : 0,` удалить).
5. Заменить блок «Ответ и действие перехода живут…»:
   ```ts
      // Ответ и действие перехода живут в состоянии-назначении; в строках переходов (в том числе глобальных) их нет.
      for (const s of steps) {
        if (s.kind !== 'error') { s.prompt_id = null; s.system_action = ''; }
        if (s.kind === 'global') s.state = '';
      }
   ```
6. В цикле проверок `for (const s of steps) {` после проверки интента добавить:
   ```ts
        if (s.kind === 'global' && s.intent_id !== null && !isGlobalIntent.get(id, s.intent_id)) {
          throw badRequest('Глобальный переход возможен только для интента, подключённого к сценарию как глобальный');
        }
   ```
7. В `INSERT INTO scenario_steps` убрать `any_intent` из списка столбцов и один `?`, и из `ins.run(...)` убрать `s.any_intent`:
   ```ts
      const ins = db.prepare(
        `INSERT INTO scenario_steps(scenario_id, part_id, position, kind, state, intent_id, request_params, condition, conditions, prompt_id, system_action, next_states)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
   ```
   ```ts
          ins.run(id, pid, i, s.kind, s.state, s.intent_id, s.request_params, s.condition, JSON.stringify(s.conditions), s.prompt_id, s.system_action, s.next_states),
   ```
8. В конце транзакции, перед `})();` добавить автоподключение:
   ```ts
      // Всё, на что ссылаются строки и состояния, подключено к сценарию (глобальные интенты уже подключены проверкой выше)
      for (const p of parts) {
        for (const s of p.steps) {
          if (s.intent_id !== null) connect(db, 'intent', id, s.intent_id);
          if (s.prompt_id !== null) connect(db, 'prompt', id, s.prompt_id);
        }
        for (const st of Object.values(p.layout as Layout)) if (st.prompt_id !== null) connect(db, 'prompt', id, st.prompt_id);
      }
   ```

- [ ] **Step 4: Прогнать**

Run: `npm test -w core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/routes/scenarios.ts core/test/scenarios.test.ts
git commit -m "feat(core): global scenario rows and auto-connect on save; drop any_intent"
```

---

## Task 6: Экспорт по подключениям и глобальные переходы

**Files:**
- Modify: `core/src/export/model.ts`, `core/src/export/tables.ts`, `core/src/export/markdown.ts`, `core/src/export/docx.ts`
- Test: `core/test/export.test.ts`

**Interfaces:**
- Produces: `ProjectSpec.globals?: TransitionRow[]`; `SpecPart.globals: TransitionRow[]`; `GLOBAL_HEAD`, `globalsTable(rows: TransitionRow[]): TableDef` в `tables.ts`; раздел `## Глобальные переходы` (только если есть), строки ошибок без интента показывают «Любой интент сценария».

- [ ] **Step 1: Написать падающие тесты**

В `core/test/export.test.ts` в `describe('export route', ...)` перед закрывающей `});` добавить:

```ts
  it('lists connected intents even when unused and exports global transitions in their own section', async () => {
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
    expect(md.match(/^## .*$/gm)).toEqual(['## Интенты', '## Сущности', '## Промпты', '## Глобальные переходы', '## Переходы между состояниями', '## Ошибки']);
    expect(md).toContain('| В состояние | Запрос пользователя | Условия | Действие системы | Ответ ассистента |');
    expect(md).toContain('| ST_END | INT_CANCEL | всегда | Сбросить | PRM_BYE |');
    expect(md).toContain('| INT_SPARE |');
    const [, afterTransitions] = md.split('## Переходы между состояниями');
    expect(afterTransitions).not.toContain('ST_END');
    expect(afterTransitions).toContain('Любой интент сценария');
    const docx = await request(app).get(`/api/scenarios/${sid}/export?format=docx`);
    const xml = await (await JSZip.loadAsync(docx.body)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Глобальные переходы');
  });

  it('does not export an intent that is not connected to the scenario', async () => {
    const { app, db } = await makeApp();
    const pid = createProject(db);
    const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id as number;
    await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'INT_LOOSE' });
    const md = (await request(app).get(`/api/scenarios/${sid}/export?format=md`)).text;
    expect(md).not.toContain('INT_LOOSE');
  });
```

В `describe('renderMarkdown', ...)` добавить:

```ts
  it('renders a global transitions section only when there are any', () => {
    expect(md).not.toContain('Глобальные переходы');
    const g = renderMarkdown({ ...spec, globals: [{ ...row, state: '', intent: 'INT_CANCEL', next_states: 'ST_END' }] }, 'd');
    expect(g).toContain('## Глобальные переходы');
    expect(g).toContain('| ST_END | INT_CANCEL | Обогрев сидений выключен | Включить обогрев | PRM_SEAT_HEATING_ON |');
  });
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w core -- export`
Expected: FAIL.

- [ ] **Step 3: `tables.ts` — добавить в конец файла**

```ts
export const GLOBAL_HEAD = ['В состояние', 'Запрос пользователя', 'Условия', 'Действие системы', 'Ответ ассистента'];
export const globalsTable = (rows: TransitionRow[]): TableDef => ({
  head: GLOBAL_HEAD,
  widths: [20, 22, 20, 20, 18],
  rows: rows.map((t): Row => ({
    cells: [
      dash(t.next_states),
      dash([t.intent, t.request_params].filter((x) => x && x.trim()).join('\n')),
      dash(t.condition),
      dash(t.system_action),
      dash(t.prompt ?? ''),
    ],
  })),
});
```

- [ ] **Step 4: `model.ts`**

1. В `ProjectSpec` после `errors: TransitionRow[];` добавить:
   ```ts
  /** Переходы глобальных интентов (из любого состояния). */
  globals?: TransitionRow[];
   ```
2. В `SpecPart` добавить `globals: TransitionRow[];`.
3. В `loadScenarioDoc` заменить блок от `const stepRefs = ...` до конца вычисления `promptIds` (включая цикл по `intentIds`, но сам цикл оставить):
   ```ts
  const intentIds = new Set(
    (db.prepare('SELECT intent_id FROM scenario_intents WHERE scenario_id = ?').all(scenarioId) as { intent_id: number }[]).map((r) => r.intent_id),
  );
  const promptIds = new Set(
    (db.prepare('SELECT prompt_id FROM scenario_prompts WHERE scenario_id = ?').all(scenarioId) as { prompt_id: number }[]).map((r) => r.prompt_id),
  );
   ```
   (цикл `for (const iid of intentIds) { ... entityIds.add ... }` остаётся.)
4. Возвращаемое значение `parts` в `loadScenarioDoc`:
   ```ts
    parts: parts.map((part) => {
      const ps = buildSpec(db, projectId, project, { scenarioId, partId: part.id, intentIds, promptIds, entityIds });
      return { title: single ? scenario.name : part.name, description: part.description, transitions: ps.transitions, globals: ps.globals ?? [] };
    }),
   ```
5. В `buildSpec` SQL строк: заменить выражение `intent`:
   ```sql
      `SELECT t.part_id, t.kind, t.state, CASE WHEN t.kind = 'error' AND t.intent_id IS NULL THEN 'Любой интент сценария' ELSE i.name END AS intent, t.request_params, t.condition, t.conditions, p.name AS prompt, t.system_action, t.next_states
   ```
6. Возврат `buildSpec`:
   ```ts
    transitions: rows.filter((r) => r.kind === 'transition').map(strip),
    errors: rows.filter((r) => r.kind === 'error').map(strip),
    globals: rows.filter((r) => r.kind === 'global' && r.intent !== null).map(strip),
   ```

- [ ] **Step 5: `markdown.ts`**

Импорт: добавить `globalsTable` в список из `./tables`. В `section(...)` перед `out.push('## Переходы между состояниями');` вставить:

```ts
  const globals = parts ? parts.filter((p) => p.globals.length) : spec.globals?.length ? [{ title: '', globals: spec.globals }] : [];
  if (globals.length) {
    out.push('## Глобальные переходы');
    for (const g of globals) {
      if (parts && parts.length > 1) out.push(`### ${g.title}`);
      out.push(table(globalsTable(g.globals)));
    }
  }
```

- [ ] **Step 6: `docx.ts`**

Импорт: добавить `globalsTable`. В `sectionBlocks` перед `return [` добавить и подставить в массив:

```ts
  const globals = parts ? parts.filter((p) => p.globals.length) : spec.globals?.length ? [{ title: '', globals: spec.globals }] : [];
  const globalBlocks: Block[] = globals.length
    ? [
        heading('Глобальные переходы'),
        ...globals.flatMap((g): Block[] => [
          ...(parts && parts.length > 1 ? [subheading(g.title)] : []),
          tableBlock(globalsTable(g.globals)),
          gap(),
        ]),
      ]
    : [];
```

и в возвращаемом массиве между `heading('Промпты'), tableBlock(promptsTable(spec)), gap(),` и `heading('Переходы между состояниями'), ...transitions, gap(),` вставить `...globalBlocks,`.

- [ ] **Step 7: Прогнать**

Run: `npm test -w core`
Expected: PASS (включая существующий `exports only the chosen scenario with what it references` — интенты подключились автоматически в задаче 5).

- [ ] **Step 8: Commit**

```bash
git add core/src/export core/test/export.test.ts
git commit -m "feat(core): export by scenario connections with a global transitions section"
```

---

## Task 7: Дампы проекта и демо

**Files:**
- Modify: `core/src/project-dump.ts`, `core/src/demo.ts`
- Test: `core/test/projects.test.ts`

**Interfaces:**
- Produces: дамп содержит `scenario_intents`, `scenario_prompts` и не содержит `scenario_id` у `intents`/`prompts` и `any_intent` у `scenario_steps`; `importProject` принимает дампы старого формата и апгрейдит их.

- [ ] **Step 1: Написать падающие тесты**

В `core/test/projects.test.ts` в `describe('project duplicate / import', ...)` дописать:

```ts
  it('keeps scenario connections through duplicate and dump', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const dup = (await request(app).post(`/api/projects/${src}/duplicate`)).body;
    const scenarios = (await request(app).get(`/api/projects/${dup.id}/scenarios`)).body;
    const connected = (await request(app).get(`/api/scenarios/${scenarios[0].id}/intents`)).body;
    expect(connected.length).toBeGreaterThan(0);
    const dump = (await request(app).get(`/api/projects/${src}/dump`)).body;
    expect(dump.tables.scenario_intents.length).toBeGreaterThan(0);
    expect(dump.tables.intents[0]).not.toHaveProperty('scenario_id');
    expect(dump.tables.scenario_steps[0]).not.toHaveProperty('any_intent');
  });

  it('upgrades a dump made before scenario connections', async () => {
    const { app } = await makeApp();
    const step = { scenario_id: 1, part_id: 1, position: 0, kind: 'transition', state: 'A', intent_id: 2, any_intent: 0, request_params: '', condition: '', conditions: '[]', prompt_id: null, system_action: '', next_states: 'B' };
    const old = {
      version: 1, name: 'Старый', description: '',
      tables: {
        scenarios: [{ id: 1, project_id: 1, name: 'S', description: '', layout: '{}' }],
        scenario_parts: [{ id: 1, scenario_id: 1, position: 0, name: 'S', description: '', layout: '{}' }],
        intents: [
          { id: 1, project_id: 1, name: 'INT_OWN', enabled: 1, comment: '', scenario_id: 1 },
          { id: 2, project_id: 1, name: 'INT_USED', enabled: 1, comment: '', scenario_id: null },
          { id: 3, project_id: 1, name: 'INT_FREE', enabled: 1, comment: '', scenario_id: null },
        ],
        prompts: [{ id: 1, project_id: 1, name: 'PRM_OWN', full_answers: '[]', short_answers: '[]', scenario_id: 1 }],
        scenario_steps: [
          { id: 1, ...step },
          { id: 2, ...step, state: 'B', intent_id: null, any_intent: 1, next_states: '' },
        ],
      },
    };
    const res = await request(app).post('/api/projects/import').send(old);
    expect(res.status).toBe(201);
    const pid = res.body.id as number;
    const sid = (await request(app).get(`/api/projects/${pid}/scenarios`)).body[0].id as number;
    expect((await request(app).get(`/api/scenarios/${sid}/intents`)).body.map((i: any) => i.name)).toEqual(['INT_OWN', 'INT_USED']);
    expect((await request(app).get(`/api/scenarios/${sid}/prompts`)).body.map((p: any) => p.name)).toEqual(['PRM_OWN']);
    const intents = (await request(app).get(`/api/projects/${pid}/intents`)).body;
    expect(intents.find((i: any) => i.name === 'INT_FREE').scenarios).toEqual([]);
    expect((await request(app).get(`/api/scenarios/${sid}`)).body.parts[0].steps.map((s: any) => s.kind)).toEqual(['transition', 'error']);
  });
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w core -- projects`
Expected: FAIL.

- [ ] **Step 3: Реализовать `core/src/project-dump.ts`**

1. После констант `VIA_*` добавить:
   ```ts
/** Поля прошлых версий: в новой схеме их нет или они не используются. Из дампов выбрасываются. */
const LEGACY: Record<string, string[]> = { intents: ['scenario_id'], prompts: ['scenario_id'], scenario_steps: ['any_intent'] };
const dropLegacy = (table: string, row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !LEGACY[table]?.includes(k)));
   ```
2. В `TABLES`: у `intents` и `prompts` `fk: {}`; после строки `prompts` вставить:
   ```ts
  { name: 'scenario_intents', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', intent_id: 'intents' } },
  { name: 'scenario_prompts', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', prompt_id: 'prompts' } },
   ```
3. `dumpProject`: `for (const t of TABLES) tables[t.name] = db.prepare(...).all(id).map((r) => dropLegacy(t.name, r));`
4. Перед `importProject` добавить:
   ```ts
/** Дамп до подключений: собираем связи из владельцев и ссылок; «любой интент» у переходов становится ошибкой. */
function upgradeDump(tables: ProjectDump['tables']): ProjectDump['tables'] {
  if (tables.scenario_intents !== undefined || tables.scenario_prompts !== undefined) return tables;
  const rows = (name: string) => (Array.isArray(tables[name]) ? tables[name] : []);
  const links = (pairs: [unknown, unknown][], col: string) => {
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const [scenario, object] of pairs) {
      if (typeof scenario !== 'number' || typeof object !== 'number' || seen.has(`${scenario}|${object}`)) continue;
      seen.add(`${scenario}|${object}`);
      out.push({ scenario_id: scenario, [col]: object, position: 0 });
    }
    return out;
  };
  const steps = rows('scenario_steps');
  return {
    ...tables,
    scenario_intents: links([...rows('intents').map((i): [unknown, unknown] => [i.scenario_id, i.id]), ...steps.map((s): [unknown, unknown] => [s.scenario_id, s.intent_id])], 'intent_id'),
    scenario_prompts: links(
      [
        ...rows('prompts').map((p): [unknown, unknown] => [p.scenario_id, p.id]),
        ...steps.map((s): [unknown, unknown] => [s.scenario_id, s.prompt_id]),
        ...rows('scenario_states').map((s): [unknown, unknown] => [s.scenario_id, s.prompt_id]),
      ],
      'prompt_id',
    ),
    scenario_steps: steps.map((s) => (Number(s.any_intent) === 1 ? { ...s, kind: 'error', intent_id: null } : s)),
  };
}
   ```
5. В `importProject` первой строкой тела после проверки версии: `const tables = upgradeDump(dump.tables);`, и дальше везде вместо `dump.tables[t.name]` использовать `tables[t.name]`. Фильтр ключей: `const keys = Object.keys(row).filter((k) => k !== 'id' && !LEGACY[t.name]?.includes(k));`.

   Порядок внутри `TABLES` гарантирует, что `scenarios` и `intents`/`prompts` уже в картах `maps` к моменту вставки связей.

- [ ] **Step 4: `core/src/demo.ts`**

Убрать `any_intent` из двух помощников:

```ts
const step = (state: string, next: string, intent_id: number | null, conditions: Cond[] = []): Step => ({
  kind: 'transition', state, intent_id, next_states: next, ...base, conditions,
});
const error = (state: string, next: string, condition: string, prompt_id: number, system_action = '', conditions: Cond[] = []): Step => ({
  kind: 'error', state, intent_id: null, next_states: next, ...base, condition, conditions, prompt_id, system_action,
});
```

- [ ] **Step 5: Прогнать**

Run: `npm test -w core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/src/project-dump.ts core/src/demo.ts core/test/projects.test.ts
git commit -m "feat(core): dumps carry scenario connections; upgrade pre-connection dumps"
```

---

## Task 8: Убрать старые колонки из схемы

**Files:**
- Modify: `core/src/db.ts`

Теперь ни один код не читает и не пишет `intents.scenario_id`, `prompts.scenario_id`, `scenario_steps.any_intent`, их можно убрать из `SCHEMA` (новые БД их не получат; существующие оставляют их нетронутыми, обнулёнными миграцией).

- [ ] **Step 1: Проверить, что колонки нигде не используются**

Run: `grep -rn "scenario_id" core/src --include=*.ts | grep -v "scenario_intents\|scenario_prompts\|scenario_parts\|scenario_dependencies\|scenario_entities\|scenario_states\|scenario_steps\|VIA_SCENARIO"` и `grep -rn "any_intent" core/src`
Expected: остаются только `LEGACY`/`upgradeDump` в `project-dump.ts`, `migrate` в `db.ts` и параметры/колонки `scenario_id` в таблицах-потомках (`links.ts`, маршруты). Любое другое совпадение исправить до продолжения.

- [ ] **Step 2: Удалить из `SCHEMA`**

В `core/src/db.ts` удалить три строки:
- в `intents`: `  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,`
- в `prompts`: `  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,`
- в `scenario_steps`: `  any_intent INTEGER NOT NULL DEFAULT 0,`

- [ ] **Step 3: Прогнать всё и типы**

Run: `npm test -w core` и `npm run typecheck -w core`
Expected: PASS. Тест миграции продолжает работать: `makeLegacy` добавляет колонки через `ALTER TABLE ... ADD COLUMN`, если их нет.

- [ ] **Step 4: Commit**

```bash
git add core/src/db.ts
git commit -m "refactor(core): drop ownership columns from the fresh schema"
```

---

## Task 9: Веб — типы, API и адаптация к новым формам

Цель: код веба компилируется и работает с новым API; поведение вкладок пока прежнее. Здесь же — `analyzeSteps`, который игнорирует глобальные строки.

**Files:**
- Modify: `web/src/lib/types.ts`, `web/src/lib/api.ts`, `web/src/lib/states.ts`, `web/src/lib/states.test.ts`
- Modify: `web/src/hooks/scenarioGroups.ts`, `web/src/pages/intents/IntentsPage.tsx`, `web/src/pages/prompts/PromptsPage.tsx`, `web/src/pages/entities/EntitiesPage.tsx`, `web/src/components/CommandPalette.tsx`
- Modify: `web/src/pages/scenarios/StepsTable.tsx`, `web/src/pages/scenarios/state-editor/EdgePanel.tsx`, `web/src/pages/scenarios/state-editor/StateEditor.tsx`

**Interfaces:**
- Produces (`types.ts`): `ScenarioLink { id; name }`; `IntentListItem { id; name; enabled; phrase_count; scenarios: ScenarioLink[]; is_global?: boolean }`; `PromptListItem { id; name; has_answer; step_count; scenarios: ScenarioLink[] }`; `UsedBy = { id; name; scenario_ids: number[] }[]`; `Step.kind: 'transition' | 'error' | 'global'` без `any_intent`.
- Produces (`api.ts`): `api.intents.connect(sid, iid, is_global?)`, `api.intents.disconnect(sid, iid)`, `api.prompts.connect(sid, pid)`, `api.prompts.disconnect(sid, pid)`.
- Produces (`states.ts`): `globalIssues(steps: Step[], known: string[]): Map<string, StepIssue[]>`; `analyzeSteps` игнорирует `kind = 'global'`, но цели глобальных строк считает достижимыми.
- Produces (`StepsTable.tsx`): `IntentSelect({ intents, value, onChange, label, emptyLabel })`.

- [ ] **Step 1: Тест `analyzeSteps` и `globalIssues`**

В `web/src/lib/states.test.ts` импорт: `import { analyzeSteps, globalIssues, layoutGraph, splitNext } from './states';`. В `describe('analyzeSteps', ...)` добавить:

```ts
  it('не считает глобальные строки переходами, но их цели достижимы', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B' });
    const b = step({ state: 'ST_B', next_states: 'END' });
    const c = step({ state: 'ST_C', next_states: 'END' });
    const g = step({ kind: 'global', state: '', intent_id: 7, next_states: 'ST_C' });
    const r = analyzeSteps([a, b, c, g], name);
    expect(r.states).toEqual(['ST_A', 'ST_B', 'ST_C']);
    expect(r.unreachable).toEqual([]);
    expect(r.issues.has(g.key!)).toBe(false);
    expect(r.edges.some((e) => e.stepKey === g.key)).toBe(false);
  });
```

и в конец файла:

```ts
describe('globalIssues', () => {
  it('требует интент и известное следующее состояние', () => {
    const ok = step({ kind: 'global', intent_id: 7, next_states: 'ST_A' });
    const noIntent = step({ kind: 'global', intent_id: null, next_states: 'ST_A' });
    const noNext = step({ kind: 'global', intent_id: 7, next_states: '' });
    const unknown = step({ kind: 'global', intent_id: 7, next_states: 'ST_X END' });
    const local = step({ kind: 'transition', state: 'A' });
    const r = globalIssues([ok, noIntent, noNext, unknown, local], ['ST_A']);
    expect(r.has(ok.key!)).toBe(false);
    expect(r.get(noIntent.key!)?.[0]).toEqual({ level: 'error', text: 'Не выбран интент' });
    expect(r.get(noNext.key!)?.[0].level).toBe('warn');
    expect(r.get(unknown.key!)?.map((i) => i.text)).toEqual(['Состояния «ST_X» нет в схеме']);
    expect(r.has(local.key!)).toBe(false);
  });
});
```

Run: `npm test -w web -- states`
Expected: FAIL (`globalIssues` не экспортируется).

- [ ] **Step 2: `types.ts`**

Заменить:

```ts
export type UsedBy = { id: number; name: string; scenario_ids: number[] }[];
```
и в `Entity` поле `used_by: UsedBy;`.

Заменить блоки интентов и промптов:

```ts
/** Сценарий, к которому подключён интент или промпт. */
export interface ScenarioLink { id: number; name: string }
export interface IntentListItem {
  id: number; name: string; enabled: boolean; phrase_count: number;
  /** Сценарии, к которым подключён интент. */
  scenarios: ScenarioLink[];
  /** Только в списке сценария: глобальный интент срабатывает в любом состоянии. */
  is_global?: boolean;
}
```
```ts
export interface PromptListItem {
  id: number; name: string; has_answer: boolean; step_count: number; scenarios: ScenarioLink[];
}
```

В `Step`: `kind: 'transition' | 'error' | 'global';`, удалить поле `any_intent` и его комментарий; комментарий над `Step` заменить:

```ts
/**
 * Строка Transition table (kind = transition), Errors (kind = error) или переход глобального интента
 * из любого состояния (kind = global, state пуст). У ошибки без интента — «по любому интенту».
 */
```

Проверить остальные использования `UsedBy`: `grep -rn "UsedBy" web/src`; правок вне `types.ts` быть не должно.

- [ ] **Step 3: `api.ts`**

В `intents` заменить `listByScenario`…`create` блок (оставить существующие методы, добавить два):

```ts
    connect: (sid: number, iid: number, is_global?: boolean) =>
      req<{ id: number; is_global: boolean }>('PUT', `/api/scenarios/${sid}/intents/${iid}`, is_global === undefined ? {} : { is_global }),
    disconnect: (sid: number, iid: number) => req<void>('DELETE', `/api/scenarios/${sid}/intents/${iid}`),
```
В `prompts`:
```ts
    connect: (sid: number, pid: number) => req<{ id: number }>('PUT', `/api/scenarios/${sid}/prompts/${pid}`, {}),
    disconnect: (sid: number, pid: number) => req<void>('DELETE', `/api/scenarios/${sid}/prompts/${pid}`),
```

- [ ] **Step 4: `states.ts`**

В начале `analyzeSteps`:

```ts
export function analyzeSteps(all: Step[], intentName: (id: number | null) => string | null, info: Layout = {}): Analysis {
  // Глобальные строки — не часть графа состояний: у них нет исходного состояния
  const steps = all.filter((s) => s.kind !== 'global');
```
Метка ребра: `label: intentName(s.intent_id) ?? ''`. Блок детерминизма:

```ts
    if (s.kind !== 'transition' || !s.state.trim() || s.intent_id === null) continue;
    const k = `${s.state.trim()}\u0000${s.intent_id}`;
```
После `steps.forEach(...)` (перед блоком «Детерминизм») добавить:

```ts
  // Цель глобального перехода достижима из любого состояния
  for (const g of all) {
    if (g.kind !== 'global') continue;
    for (const t of splitNext(g.next_states)) if (STATE_LIKE.test(t)) referenced.add(t);
  }
```
В конец файла перед `export interface Placed` добавить `globalIssues` (как в тесте):

```ts
/** Замечания по строкам глобальных переходов; known — состояния схемы. Ключ — step.key. */
export function globalIssues(steps: Step[], known: string[]): Map<string, StepIssue[]> {
  const out = new Map<string, StepIssue[]>();
  for (const s of steps) {
    if (s.kind !== 'global' || !s.key) continue;
    const list: StepIssue[] = [];
    if (s.intent_id === null) list.push({ level: 'error', text: 'Не выбран интент' });
    const targets = splitNext(s.next_states);
    if (targets.length === 0) list.push({ level: 'warn', text: 'Не указано следующее состояние' });
    for (const t of targets) if (!TERMINAL.test(t) && !known.includes(t)) list.push({ level: 'warn', text: `Состояния «${t}» нет в схеме` });
    if (list.length) out.set(s.key, list);
  }
  return out;
}
```

Run: `npm test -w web -- states`
Expected: PASS.

- [ ] **Step 5: `scenarioGroups.ts` — упростить**

Весь файл:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ScenarioListItem } from '@/lib/types';

/** Сценарии проекта и название сценария по id. */
export function useScenarioGroups(projectId: number) {
  const { data: scenarios = [] } = useQuery<ScenarioListItem[]>({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId) });
  const nameOf = (sid: number | null | undefined) => scenarios.find((s) => s.id === sid)?.name ?? null;
  return { scenarios, nameOf };
}
```

- [ ] **Step 6: `IntentsPage.tsx`**

Заменить импорт хука и тело до `return`:

```tsx
import { useScenarioGroups } from '@/hooks/scenarioGroups';
```
→ удалить (страница больше не использует), и в начале компонента:

```tsx
export function IntentsPage() {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });
  const loaded = useQueries({
    queries: list.map((i) => ({ queryKey: ['intent', i.id], queryFn: () => api.intents.get(i.id), gcTime: 0 })),
  });
  const scenariosOf = new Map(list.map((i) => [i.id, i.scenarios]));
  const items = loaded.flatMap((q) => (q.data ? [{ ...q.data, used_by: [], scenarios: scenariosOf.get(q.data.id) ?? [] }] : []));
```
В JSX: 
```tsx
      groupOf={(i) => (i.scenarios.length ? 'Подключены к сценариям' : null)}
      fallbackGroup="Не используются"
      ...
      usedIn={(i) => i.scenarios}
      ...
      deleteDescription={(d) =>
        d.scenarios.length
          ? `Интент подключён к сценариям: ${d.scenarios.map((s) => s.name).join(', ')}. Их шаги останутся без интента, глобальные переходы будут удалены.`
          : 'Шаги сценариев, использующие этот интент, останутся без интента.'
      }
```
В `onSave`: `const { id: _id, project_id: _pid, used_by: _u, scenarios: _s, ...body } = d;`.

- [ ] **Step 7: `PromptsPage.tsx`**

Аналогично: удалить `useScenarioGroups`; `const scenariosOf = new Map(list.map((p) => [p.id, p.scenarios]));`, `const items = loaded.flatMap((q) => (q.data ? [{ ...q.data, used_by: [], scenarios: scenariosOf.get(q.data.id) ?? [] }] : []));`, `groupOf={(i) => (i.scenarios.length ? 'Подключены к сценариям' : null)}`, `fallbackGroup="Не используются"`, `usedIn={(i) => i.scenarios}`; `deleteDescription={(d) => d.scenarios.length ? \`Промпт подключён к сценариям: ${d.scenarios.map((s) => s.name).join(', ')}. Их строки и состояния останутся без промпта.\` : 'Строки сценариев, использующие этот промпт, останутся без промпта.'}`.

- [ ] **Step 8: `EntitiesPage.tsx`**

Заменить `usedIn`:

```tsx
      usedIn={(i) => {
        const ids = [...new Set(i.used_by.flatMap((u) => u.scenario_ids))];
        return ids.flatMap((id) => {
          const name = nameOf(id);
          return name ? [{ id, name }] : [];
        });
      }}
```

- [ ] **Step 9: `CommandPalette.tsx`**

Заменить два хита (строки 162–170); функцию `scenarioName` удалить:

```tsx
      ...(intents.data ?? []).map((i): Hit => ({
        key: `i${i.id}`, kind: 'intent', name: i.name, hint: i.scenarios.map((s) => s.name).join(', ') || undefined, text: phrases.get(i.id),
        to: path(`/lists/intents/${i.id}`),
      })),
```
```tsx
      ...(prompts.data ?? []).map((p): Hit => ({
        key: `p${p.id}`, kind: 'prompt', name: p.name, hint: p.scenarios.map((s) => s.name).join(', ') || undefined, text: answers.get(p.id),
        to: path(`/lists/prompts/${p.id}`),
      })),
```

- [ ] **Step 10: `StepsTable.tsx` — `IntentSelect` и подписи**

Заменить `IntentSelect` (строки 91–105):

```tsx
/** Выбор интента строки; пустое значение подписывается по-разному: у ошибок это «любой интент». */
export function IntentSelect({ intents, value, onChange, label, emptyLabel = '— не выбран —' }: {
  intents: IntentListItem[]; value: number | null; onChange: (v: number | null) => void; label: string; emptyLabel?: string;
}) {
  const options = [{ value: 'none', label: emptyLabel }, ...intents.map((i) => ({ value: String(i.id), label: i.name }))];
  return <OptionSelect options={options} value={value} onChange={onChange} label={label} />;
}
```

В `StepRow`: `const intent = intents.find((i) => i.id === step.intent_id)?.name;` и строку отображения интента:

```tsx
            {intent ? <TypeToken kind="intent" title={intent}>{intent}</TypeToken> : <span className="text-muted-foreground">{step.kind === 'error' ? 'любой' : 'не выбран'}</span>}
```
Вызов в раскрытом редакторе (строка 201):

```tsx
              <IntentSelect intents={intents} value={step.intent_id} emptyLabel={step.kind === 'error' ? 'Любой интент' : '— не выбран —'} onChange={(intent_id) => onPatch({ intent_id })} label={`Интент, строка ${index + 1}`} />
```

- [ ] **Step 11: `EdgePanel.tsx`**

```tsx
  const intent = intents.find((i) => i.id === step.intent_id)?.name;
```
и

```tsx
        <IntentSelect intents={intents} value={step.intent_id} onChange={(intent_id) => onPatch({ intent_id })} label="Интент" />
```

- [ ] **Step 12: `StateEditor.tsx` (строка 78)**

```tsx
  const intentTitle = (s: Step) => intents.find((i) => i.id === s.intent_id)?.name ?? 'без интента';
```

- [ ] **Step 13: Проверить сборку и тесты**

Run: `npm run typecheck -w web` и `npm test -w web`
Expected: PASS. Если `tsc` находит другие обращения к `scenario_id`/`any_intent`/`used_by.scenario_id`, исправить по образцу выше (`grep -rn "scenario_id\|any_intent" web/src`).

- [ ] **Step 14: Commit**

```bash
git add web/src
git commit -m "feat(web): adapt to scenario connections (types, api, dictionaries, step selects)"
```

> Из-за незакоммиченных чужих правок в `web/src` здесь удобнее добавить только файлы этой задачи поимённо.

---

## Task 10: Веб — глобальные переходы на вкладке «Логика»

**Files:**
- Create: `web/src/pages/scenarios/GlobalTransitions.tsx`
- Modify: `web/src/pages/scenarios/StepsTable.tsx`, `web/src/pages/scenarios/ScenarioForm.tsx`, `web/src/pages/scenarios/ScenarioChecks.tsx`

**Interfaces:**
- Consumes: `globalIssues`, `IntentSelect`, `StepsTable` (`kind: 'global'`).
- Produces: `GlobalTransitions({ steps, intents, dependencies, entities, states, known, onChange })`; в `ScenarioForm` `setTransitions`/`setErrors`/`setGlobals` не теряют строки чужих видов.

- [ ] **Step 1: `StepsTable.tsx` — режим глобальных**

1. Внутри `StepRow` добавить `const isGlobal = step.kind === 'global';` (новых props не нужно: вид строки известен из `step.kind`).
2. Ячейка состояния:
   ```tsx
            {isGlobal
              ? <span className="text-sm text-muted-foreground">Любое состояние</span>
              : step.state.trim()
                ? <span className="inline-block max-w-full break-all rounded-[5px] bg-st-bg px-2 py-0.5 font-mono text-xs font-medium text-st">{step.state}</span>
                : <span className="text-sm italic text-muted-foreground">без состояния</span>}
   ```
3. В раскрытом редакторе обернуть блок «Состояние» (`<div><FieldLabel>Состояние</FieldLabel> … </div>`) в `{!isGlobal && (…)}`, а блоки «Ответ ассистента» и «Действие системы» — в `{!isGlobal && (<>…</>)}`.
4. `StepsTable`: `aria-label={title}` на `<section>` (вместо жёстко заданного «Правила обработки ошибок»); подсказку и пустое состояние:
   ```tsx
        <p className="text-sm text-muted-foreground">
          {kind === 'global' ? 'Проверяются сверху вниз; срабатывает первый подошедший переход.' : 'Правила проверяются сверху вниз, срабатывает первое подошедшее.'}
        </p>
   ```
   ```tsx
            <p className="text-sm text-muted-foreground">{kind === 'global' ? 'Глобальных переходов пока нет.' : 'Правил пока нет: при ошибке ассистент не знает, что ответить.'}</p>
   ```
   Заголовок колонки «Состояние» оставить.

- [ ] **Step 2: `GlobalTransitions.tsx`**

```tsx
import { useMemo } from 'react';
import { globalIssues } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Step } from '@/lib/types';
import { StepsTable } from './StepsTable';

interface Props {
  /** Только глобальные строки вкладки. */
  steps: Step[];
  /** Глобальные интенты сценария. */
  intents: IntentListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  /** Состояния схемы вкладки: подсказки для «Следующие состояния» и проверка целей. */
  states: string[];
  onChange: (steps: Step[]) => void;
}

/** Переходы глобальных интентов: срабатывают из любого состояния вкладки. */
export function GlobalTransitions({ steps, intents, dependencies, entities, states, onChange }: Props) {
  const issues = useMemo(() => globalIssues(steps, states), [steps, states]);
  return (
    <section aria-label="Глобальные переходы" className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">Глобальные переходы</h3>
        <p className="text-sm text-muted-foreground">Срабатывают из любого состояния по глобальным интентам. Интент становится глобальным на вкладке «Интенты».</p>
      </div>
      <StepsTable
        kind="global"
        title="Глобальные переходы"
        steps={steps}
        intents={intents}
        prompts={[]}
        dependencies={dependencies}
        entities={entities}
        allStates={states}
        issues={issues}
        onChange={onChange}
      />
    </section>
  );
}
```

- [ ] **Step 3: `ScenarioForm.tsx`**

1. Импорты: `import { GlobalTransitions } from './GlobalTransitions';`.
2. Заменить сеттеры строк (около строк 139–142):
   ```tsx
  const stepsOf = (kind: Step['kind']) => part.steps.filter((s) => s.kind === kind);
  // Каждый вид строк правится отдельно и не должен терять остальные
  const setKind = (kind: Step['kind'], rows: Step[], layout?: Layout) =>
    updatePart(part.key!, (p) => ({
      ...p,
      layout: layout ?? p.layout,
      steps: [...p.steps.filter((s) => s.kind !== kind), ...rows],
    }));
  const setErrors = (rows: Step[]) => setKind('error', rows);
  const setGlobals = (rows: Step[]) => setKind('global', rows);
  const setTransitions = (rows: Step[], layout?: Layout) =>
    updatePart(part.key!, (p) => ({ ...p, layout: layout ?? p.layout, steps: [...rows, ...p.steps.filter((s) => s.kind !== 'transition')] }));
   ```
3. Рядом с `fsm` посчитать:
   ```tsx
  const globalIntents = intents.filter((i) => i.is_global);
  const globalSteps = stepsOf('global');
  const knownStates = useMemo(
    () => [...new Set([...fsm.states, ...Object.keys(part.layout), ...fsm.edges.map((e) => e.to)])],
    [fsm, part.layout],
  );
   ```
4. В блоке `tab === 'logic'` после `<StateEditor … />` (внутри того же `div`) добавить:
   ```tsx
          {(globalIntents.length > 0 || globalSteps.length > 0) && (
            <GlobalTransitions
              steps={globalSteps}
              intents={globalIntents}
              dependencies={draft.dependencies}
              entities={entities}
              states={knownStates}
              onChange={setGlobals}
            />
          )}
   ```
5. Текст подтверждения удаления сценария: `description="Интенты и промпты останутся в словаре проекта."`; в диалоге удаления вкладки: `"Её состояния и переходы будут удалены. Интенты и промпты останутся подключёнными к сценарию."`.
6. Комментарий над `withUsed` заменить на: `// В шагах выбираются интенты и промпты, подключённые к сценарию; сохранение само подключает ссылки, поэтому чужие здесь могут быть только до первого сохранения`.

- [ ] **Step 4: `ScenarioChecks.tsx`**

В `buildChecks` после проверки `usedIntents` добавить:

```ts
  const globalUsed = new Set(p.parts.flatMap((x) => x.steps.filter((s) => s.kind === 'global').map((s) => s.intent_id)));
  for (const i of p.intents) {
    if (i.is_global && !globalUsed.has(i.id)) out.push({ level: 'info', text: `У глобального интента «${i.name}» нет глобальных переходов`, tab: 'logic', area: 'logic' });
  }
```
(`usedIntents` уже включает интенты глобальных строк: он строится по всем `steps`.) В цикле по `p.parts` перед `at('warn', …dangling)` добавить:

```ts
    const globals = part.steps.filter((s) => s.kind === 'global');
    if (globals.some((s) => s.intent_id === null)) at('error', 'Есть глобальный переход без интента');
    if (globals.some((s) => !s.next_states.trim())) at('warn', 'У глобального перехода не указано следующее состояние');
```

- [ ] **Step 5: Проверка**

Run: `npm run typecheck -w web` и `npm test -w web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/scenarios
git commit -m "feat(web): global transitions block on the logic tab"
```

---

## Task 11: Веб — вкладки «Интенты» и «Промпты» сценария

**Files:**
- Modify: `web/src/pages/intents/IntentsTable.tsx`, `web/src/pages/prompts/PromptsTable.tsx`

**Interfaces:**
- Consumes: `api.intents.create/connect/disconnect/listByScenario/list`, `api.prompts.create/connect/disconnect/listByScenario/list`.

- [ ] **Step 1: `IntentsTable.tsx`**

1. Импорты: заменить `import { ChevronDown, Plus, Trash2, X } from 'lucide-react';` на `import { ChevronDown, Plus, Unlink, X } from 'lucide-react';`; убрать `ConfirmDialog`; добавить `import type { EntityListItem, Intent, IntentEntity, IntentListItem } from '@/lib/types';`.
2. Колонки: `const COLS = 'xl:grid-cols-[230px_minmax(0,1fr)_260px_56px_72px_32px]';`
3. `IntentRow` — новая сигнатура и разметка. Сигнатура:
   ```tsx
function IntentRow({ intent, link, defaultOpen, onToggleGlobal, onDisconnect }: {
  intent: Intent; link: IntentListItem; defaultOpen: boolean; onToggleGlobal: (v: boolean) => void; onDisconnect: () => void;
}) {
   ```
   Под названием интента (внутри `<span className=… col-start-1 …>` после `TypeToken`) показать пометку общего интента:
   ```tsx
          {link.scenarios.length > 1 && <span className="mt-0.5 block text-xs text-faint">также в: {link.scenarios.map((s) => s.name).join(', ')}</span>}
   ```
   Заменить `<span className="col-start-2 row-start-1 flex items-center xl:col-start-4">…Switch enabled…</span>` на пару переключателей:
   ```tsx
        <span className="col-start-2 row-start-1 flex items-center gap-3 xl:contents">
          <span className="flex items-center xl:col-start-4">
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} aria-label={`Интент ${draft.name} включён`} />
          </span>
          <span className="flex items-center xl:col-start-5">
            <Switch checked={!!link.is_global} onCheckedChange={onToggleGlobal} aria-label={`Интент ${draft.name} глобальный`} />
          </span>
        </span>
   ```
   Кнопка-шеврон: `xl:col-start-5` → `xl:col-start-6`. Кнопку «Удалить интент» заменить:
   ```tsx
            <Button variant="ghost" className="max-md:h-10" onClick={onDisconnect}>
              <Unlink className="size-4" /> Убрать из сценария
            </Button>
   ```
   `onClick`-фильтр клика по строке уже игнорирует `[role=switch]`.
4. `IntentRowLoader`:
   ```tsx
function IntentRowLoader({ link, defaultOpen, onToggleGlobal, onDisconnect }: {
  link: IntentListItem; defaultOpen: boolean; onToggleGlobal: (v: boolean) => void; onDisconnect: () => void;
}) {
  // gcTime: 0 — строки инициализируются из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['intent', link.id], queryFn: () => api.intents.get(link.id), gcTime: 0 });
  if (!data) return <div className="min-h-12 border-t first:border-t-0" />;
  return <IntentRow intent={data} link={link} defaultOpen={defaultOpen} onToggleGlobal={onToggleGlobal} onDisconnect={onDisconnect} />;
}
   ```
5. `IntentsTable` целиком:
   ```tsx
export function IntentsTable({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<number | null>(null);
  const { data: items = [], isSuccess } = useQuery({ queryKey: ['intents', 'scenario', scenarioId], queryFn: () => api.intents.listByScenario(scenarioId) });
  // Название интента уникально в рамках всего проекта, а не только сценария
  const { data: all = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });

  const trimmed = name.trim();
  const duplicate = all.some((i) => i.name.trim().toLowerCase() === trimmed.toLowerCase());
  const refresh = () => qc.invalidateQueries({ queryKey: ['intents'] });
  const onError = (e: Error) => toast.error(e.message);
  const create = useMutation({
    mutationFn: (n: string) => api.intents.create(scenarioId, n),
    onSuccess: (c) => { setName(''); setCreated(c.id); refresh(); },
    onError,
  });
  const connect = useMutation({
    mutationFn: (v: { id: number; is_global?: boolean }) => api.intents.connect(scenarioId, v.id, v.is_global),
    onSuccess: (_d, v) => { if (v.is_global === undefined) setCreated(v.id); refresh(); },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });
  const disconnect = useMutation({ mutationFn: (id: number) => api.intents.disconnect(scenarioId, id), onSuccess: refresh, onError });
  const free = all.filter((i) => !items.some((x) => x.id === i.id)).map((i) => ({ value: String(i.id), label: i.name }));

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !duplicate) create.mutate(trimmed);
        }}
      >
        <div className="min-w-0 flex-1 basis-64">
          <Input
            className="h-10 rounded-lg bg-background px-3 md:h-9"
            aria-label="Название нового интента"
            aria-invalid={duplicate}
            placeholder="Название нового интента"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {duplicate && trimmed && <p role="alert" className="mt-1 text-sm text-destructive">Интент с таким названием уже есть в проекте</p>}
        </div>
        <Button type="submit" className="max-md:h-10" disabled={!trimmed || duplicate}>
          <Plus className="size-4" /> Интент
        </Button>
        {free.length > 0 && (
          <Select items={free} value={null} onValueChange={(v) => v != null && connect.mutate({ id: Number(v) })}>
            <SelectTrigger className="h-9 w-56 justify-start border-dashed bg-transparent text-muted-foreground max-md:h-10" aria-label="Подключить существующий интент">
              <Plus className="size-3.5" />
              <SelectValue placeholder="подключить существующий" />
            </SelectTrigger>
            <SelectContent>
              {free.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </form>
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="Интенты сценария">
        <div className={cn('hidden gap-x-3 px-4 py-2 text-xs font-medium text-muted-foreground xl:grid', COLS)}>
          <span>Интент</span>
          <span>Фразы</span>
          <span>Сущности</span>
          <span>Вкл.</span>
          <span title="Срабатывает из любого состояния">Глоб.</span>
          <span />
        </div>
        {items.map((i) => (
          <IntentRowLoader
            key={i.id}
            link={i}
            defaultOpen={i.id === created}
            onToggleGlobal={(is_global) => connect.mutate({ id: i.id, is_global })}
            onDisconnect={() => disconnect.mutate(i.id)}
          />
        ))}
        {isSuccess && items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Интентов пока нет. Введите название выше или подключите существующий интент.</p>}
      </section>
    </div>
  );
}
   ```
   Импорт `X`, `ChevronDown` остаются в использовании внутри файла; `Trash2` и `ConfirmDialog` больше не нужны (убрать из импорта, если `tsc` ругается на неиспользуемые).

- [ ] **Step 2: `PromptsTable.tsx`**

1. Импорты: заменить `Trash2` на `Unlink` в `lucide-react`, убрать `ConfirmDialog`; добавить `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` из `@/components/ui/select` и `import type { Prompt, PromptListItem } from '@/lib/types';`.
2. `PromptRow({ prompt, link, onDisconnect })`: вместо `onDelete` — `onDisconnect`; под `TypeToken` имени (внутри ветки `renaming ? … : (<>…</>)`) не менять разметку, а после блока имени добавить пометку: в `<span className="min-w-0 pt-1">` рядом с токеном:
   ```tsx
              {link.scenarios.length > 1 && <span className="mt-0.5 block text-xs text-faint">также в: {link.scenarios.map((s) => s.name).join(', ')}</span>}
   ```
   Кнопку удаления заменить:
   ```tsx
        <Button variant="ghost" size="icon" className="max-md:size-10" aria-label={`Убрать промпт ${draft.name} из сценария`} title="Убрать из сценария" onClick={onDisconnect}>
          <Unlink className="size-4" />
        </Button>
   ```
3. `PromptRowLoader({ link, onDisconnect })` — по аналогии с интентами (`['prompt', link.id]`).
4. `PromptsTable`: те же мутации (`create` через `api.prompts.create(scenarioId, n)`, `connect: api.prompts.connect`, `disconnect: api.prompts.disconnect`), список `free`, форма с `Select` «подключить существующий». Подпись пустого состояния: `Промптов пока нет. Промпт — ответ ассистента: добавьте его или подключите существующий и привяжите к состоянию сценария.`
5. Удалить `deleting`-состояние и `ConfirmDialog`.

- [ ] **Step 3: Проверка**

Run: `npm run typecheck -w web` и `npm test -w web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/intents/IntentsTable.tsx web/src/pages/prompts/PromptsTable.tsx
git commit -m "feat(web): scenario intents and prompts tabs connect, create and disconnect objects"
```

---

## Task 12: Веб — создание сущности из сценария

**Files:**
- Modify: `web/src/pages/scenarios/ScenarioEntities.tsx`

**Interfaces:**
- Consumes: `CreateDialog` (`open`, `onOpenChange`, `title`, `prefix`, `existingNames`, `onCreate(name) => Promise<unknown>`), `usePrefixes(projectId).entity`, `api.entities.create(pid, name)`.

- [ ] **Step 1: Реализовать**

В `ScenarioEntities.tsx`:

1. Импорты:
   ```tsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CreateDialog } from '@/components/CreateDialog';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { usePrefixes } from '@/lib/prefixes';
   ```
2. В начале компонента:
   ```tsx
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  // Индекс строки, для которой создаётся новая сущность
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const NEW = '__new__';
   ```
3. `onValueChange` селекта:
   ```tsx
            onValueChange={(v) => (v === NEW ? setCreatingFor(i) : patch(i, { entity_id: v == null ? null : Number(v) }))}
   ```
4. В `SelectContent` после списка `options` добавить пункт:
   ```tsx
              <SelectItem value={NEW}>+ Новая сущность…</SelectItem>
   ```
5. После `</Card>` (обернув в фрагмент `<>…</>`) добавить диалог:
   ```tsx
      <CreateDialog
        open={creatingFor !== null}
        onOpenChange={(o) => !o && setCreatingFor(null)}
        title="Новая сущность"
        prefix={prefixes.entity}
        existingNames={entities.map((e) => e.name)}
        onCreate={(name) => {
          // CreateDialog сам закрывается после onCreate и ждёт синхронный обработчик
          const row = creatingFor;
          setCreatingFor(null);
          api.entities
            .create(projectId, name)
            .then((created) => {
              qc.invalidateQueries({ queryKey: ['entities'] });
              if (row !== null) patch(row, { entity_id: created.id });
            })
            .catch((e: Error) => toast.error(e.message));
        }}
      />
   ```
   Добавить `import { toast } from 'sonner';`. Гонка с автосохранением безвредна: `patch` вызывает `onChange` родителя, а черновик сценария сохраняется как обычно.

- [ ] **Step 2: Проверка**

Run: `npm run typecheck -w web` и `npm test -w web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/scenarios/ScenarioEntities.tsx
git commit -m "feat(web): create a new entity straight from the scenario entities table"
```

---

## Task 13: Итоговая проверка

- [ ] **Step 1: Полный прогон**

Run: `npm test` (оба пакета), `npm run typecheck -w core`, `npm run typecheck -w web`, `npm run build`
Expected: всё зелёное.

- [ ] **Step 2: Остаточные ссылки на старую модель**

Run: `grep -rn "any_intent\|listByScenario\|scenario_id" web/src` и `grep -rn "any_intent" core/src`
Expected: `listByScenario` встречается только как вызов списка подключённых; `scenario_id` — только в типах/ответах, не относящихся к интентам/промптам; `any_intent` — только в `migrate`/`upgradeDump`.

- [ ] **Step 3: Ручная проверка в браузере** (skill `run`: запустить `npm run dev`, открыть приложение)

Проверить на демо-проекте «умный дом» и на старой БД (если в браузере уже есть проект до миграции — открыть его, убедиться, что данные на месте):
1. Вкладка «Интенты» сценария: все прежние интенты на месте, «Глоб.» выключено; «подключить существующий» показывает интенты других сценариев.
2. Создать новый интент во вкладке — он появляется в словаре «Подключены к сценариям».
3. Включить «Глоб.» у интента → на вкладке «Логика» появляется блок «Глобальные переходы»; добавить строку, выбрать интент и «Следующее состояние», сохранить, обновить страницу — строка на месте.
4. Выключить «Глоб.» при существующей глобальной строке — тост с ошибкой, переключатель возвращается.
5. «Убрать из сценария» у интента, используемого в шагах — тост с ошибкой; у неиспользуемого — исчезает из вкладки, но остаётся в словаре («Не используются»).
6. Удалить сценарий — интенты и промпты остаются в словаре.
7. Экспорт сценария (md/docx): раздел «Глобальные переходы» виден только когда есть глобальные строки; ошибки без интента показывают «Любой интент сценария».
8. «Сущности сценария» → «+ Новая сущность…» создаёт сущность и выбирает её в строке.

- [ ] **Step 4: Обновить README при необходимости** — если в `README.md` описана привязка интентов к сценарию, поправить описание (одно-два предложения).

- [ ] **Step 5: Финальный коммит** (если остались правки) и вызов `superpowers:finishing-a-development-branch`.
