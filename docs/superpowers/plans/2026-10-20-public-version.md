# VA Spec Maker — публичная версия: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить внутренний сервис (Node + Express + SQLite) в публичное статическое приложение VA Spec Maker с несколькими проектами, русскими спецификациями, дизайном в духе Dropbox и live-демо на GitHub Pages.

**Architecture:** Серверная часть превращается в пакет `core` без Node-API: SQLite в WASM (sql.js) с адаптером, повторяющим используемую часть API better-sqlite3, и мини-роутер, повторяющий используемую часть API Express. Файлы `routes/*` почти не меняются (импорт `Router` заменяется на свой), поэтому SQL и бизнес-логика сохраняются. Веб-клиент вызывает `core` в том же процессе вместо `fetch`; БД сохраняется в IndexedDB. Деплой — статика на GitHub Pages.

**Tech Stack:** TypeScript, sql.js, docx, Vitest, React 19, Vite 8, Tailwind 4, React Router (HashRouter), TanStack Query, GitHub Actions.

> Отклонение от спеки: вместо переписывания роутов в «чистые функции» используется мини-роутер (см. Architecture). Результат тот же, объём работ и риск регрессий меньше.

## Global Constraints

- Название продукта везде: «VA Spec Maker». В шапке/сайдбаре без префикса имени проекта.
- Удалить полностью (код, таблицы БД, тесты, пункты поиска Ctrl K): «Относительные регулировки», «Result codes», вариации интента, поле «код результата», колонку «Result code». Слова `adjustment`, `result_code`, `result-codes`, `variant` не должны встречаться в `core/` и `web/src/` (кроме `class-variance-authority`/`cva` и `variant=` у UI-кнопок).
- Код миграций старой БД не переносится: схема создаётся с чистого листа.
- Спецификации (MD, DOCX, предпросмотр) — на русском: разделы «Интенты», «Сущности», «Промпты», «Переходы между состояниями», «Ошибки».
- Режим работы / «Режим работы» в проекте не создавать (в коде его нет).
- Хостинг — GitHub Pages: роутинг через `HashRouter`, `base` Vite берётся из переменной окружения `BASE_PATH` (по умолчанию `/`).
- Лицензия MIT. Публикация на GitHub — только по явной команде пользователя.
- Коммиты завершать строкой `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Интерфейс и сообщения об ошибках — на русском; код и идентификаторы — на английском, как сейчас.

## Структура файлов (итог)

```
package.json                  workspaces: core, web
core/                         (бывший server/)
  package.json                name "@va/core", exports ./src/index.ts
  src/index.ts                публичный API: createBackend, seedDemo, типы
  src/sqlite.ts               адаптер sql.js -> интерфейс Db (prepare/exec/transaction/serialize)
  src/router.ts               мини-Express: Router(), Req, Res
  src/app.ts                  createApp(db) -> { handle(req) }
  src/db.ts                   SCHEMA, openDb(opts)
  src/errors.ts               HttpError + errorResponse()
  src/validate.ts, unique.ts  без изменений (кроме импортов)
  src/project-dump.ts         dumpProject / importProject (дубли, импорт/экспорт JSON)
  src/demo.ts                 seedDemo(app): демо-проект
  src/routes/*.ts             entities, intents, prompts, scenarios, dependency-dictionary, projects, export
  src/export/*.ts             model, tables, markdown, docx (русские)
  test/*.test.ts
web/
  src/lib/backend.ts          инициализация core + IndexedDB + request()
  src/lib/api.ts              тот же контракт, транспорт — backend.request
  src/pages/projects/ProjectsPage.tsx
  src/components/ProjectSwitcher.tsx, Sidebar (в AppShell)
  .github/workflows/pages.yml (в корне репозитория)
```

---

### Task 1: Пакет `core` на sql.js + мини-роутер, существующие тесты зелёные

Цель: убрать Express/better-sqlite3 и перенести ВСЮ существующую функциональность без изменений поведения. Фичи пока не удаляем.

**Files:**
- Move: `server/` → `core/`
- Create: `core/src/sqlite.ts`, `core/src/router.ts`, `core/src/index.ts`, `core/test/request.ts`
- Modify: `core/package.json`, `package.json`, `core/src/{app,db,errors,unique}.ts`, `core/src/routes/*.ts`, `core/src/export/docx.ts`, `core/test/*.ts`
- Delete: `core/src/index.ts` (старый запуск сервера — перезаписывается новым), `start.bat` (папку `data/` не трогать)

**Interfaces:**
- Produces:
  - `sqlite.ts`: `interface Db { prepare(sql): Statement; exec(sql: string): void; transaction<T>(fn: () => T): () => T; serialize(): Uint8Array }`, `Statement { get(...p): any; all(...p): any[]; run(...p): { changes: number; lastInsertRowid: number } }`, `async function openSqlite(opts?: { data?: Uint8Array; locateFile?: (f: string) => string }): Promise<Db>`.
  - `router.ts`: `Router()` с методами `get/post/put/patch/delete(path, handler)`; `Req { params, query, body }`; `Res` (`status`, `json`, `send`, `type`, `setHeader`, `end`).
  - `app.ts`: `createApp(db: Db): App`, `interface App { handle(r: { method: string; url: string; body?: unknown }): Promise<{ status: number; headers: Record<string,string>; body: unknown }> }`. URL приходит с префиксом `/api`.
  - `db.ts`: `openDb(opts?: OpenOpts): Promise<Db>` (создаёт схему).
  - `test/request.ts`: `request(app)` с `.get/.post/.put/.patch/.delete(url)`, цепочки `.send(body)`, `.buffer()`, `.parse()` (no-op), `await` даёт `{ status, body, text, headers }`; для Blob-ответа `body` — `Buffer`.

- [ ] **Step 1: git init и перенос**

```bash
cd "v:/Claude/VA Spec Maker"
git init
mv server core
rm -rf start.bat core/node_modules node_modules web/node_modules package-lock.json
# data/ (рабочая база spec.db) НЕ удалять: она вне git (.gitignore: data/*.db) и остаётся у владельца
```

- [ ] **Step 2: Зависимости**

`core/package.json`:

```json
{
  "name": "@va/core",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "docx": "^9.12.0", "sql.js": "^1.13.0" },
  "devDependencies": {
    "@types/node": "^26.6.5", "@types/sql.js": "^1.4.9", "jszip": "^3.10.2",
    "typescript": "^7.0.2", "vitest": "^5.0.5"
  }
}
```

Корневой `package.json`: `"workspaces": ["core", "web"]`; скрипты: `"dev": "npm run dev -w web"`, `"build": "npm run build -w web"`, `"test": "npm run test -w core && npm run test -w web"`, убрать `start` и `concurrently`. В `web/package.json` добавить зависимость `"@va/core": "*"`. Запустить `npm install`.

- [ ] **Step 3: Адаптер `core/src/sqlite.ts`**

```ts
import initSqlJs from 'sql.js';

export interface RunResult { changes: number; lastInsertRowid: number }
export interface Statement {
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
  run(...params: unknown[]): RunResult;
}
export interface Db {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  serialize(): Uint8Array;
}
export interface OpenOpts { data?: Uint8Array; locateFile?: (file: string) => string }

const bind = (params: unknown[]) => params.map((p) => (p === undefined ? null : p)) as (string | number | null | Uint8Array)[];

/** sql.js бросает обычный Error; routes/errors ждут код better-sqlite3. */
function tagged(e: unknown): never {
  if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) (e as Error & { code?: string }).code = 'SQLITE_CONSTRAINT_UNIQUE';
  throw e;
}

export async function openSqlite(opts: OpenOpts = {}): Promise<Db> {
  const SQL = await initSqlJs(opts.locateFile ? { locateFile: opts.locateFile } : {});
  const raw = new SQL.Database(opts.data);
  raw.exec('PRAGMA foreign_keys = ON');
  let depth = 0;

  const query = (sql: string, params: unknown[], each: (row: Record<string, unknown>) => boolean) => {
    const st = raw.prepare(sql);
    try {
      st.bind(bind(params));
      while (st.step()) if (each(st.getAsObject())) break;
    } catch (e) {
      tagged(e);
    } finally {
      st.free();
    }
  };

  return {
    prepare: (sql) => ({
      get(...p) {
        let out: any;
        query(sql, p, (row) => ((out = row), true));
        return out;
      },
      all(...p) {
        const out: any[] = [];
        query(sql, p, (row) => (out.push(row), false));
        return out;
      },
      run(...p) {
        query(sql, p, () => false);
        const changes = raw.getRowsModified();
        const id = raw.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
        return { changes, lastInsertRowid: id };
      },
    }),
    exec: (sql) => { try { raw.exec(sql); } catch (e) { tagged(e); } },
    transaction: (fn) => () => {
      if (depth++ > 0) { try { return fn(); } finally { depth--; } }
      raw.exec('BEGIN');
      try {
        const r = fn();
        raw.exec('COMMIT');
        return r;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    serialize: () => raw.export(),
  };
}
```

Замечание: `raw.export()` сбрасывает `PRAGMA foreign_keys` у sql.js — после `export` выполнить `raw.exec('PRAGMA foreign_keys = ON')`. Добавить эту строку в `serialize`.

- [ ] **Step 4: Мини-роутер `core/src/router.ts`**

```ts
export interface Req { params: Record<string, string>; query: Record<string, string>; body: any }

export class Res {
  statusCode = 200;
  headers: Record<string, string> = {};
  payload: unknown = undefined;
  status(c: number) { this.statusCode = c; return this; }
  json(b: unknown) { this.payload = b; return this; }
  send(b: unknown) { this.payload = b; return this; }
  type(t: string) { this.headers['content-type'] = t; return this; }
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; }
  end() { return this; }
}

export type Handler = (req: Req, res: Res) => void | Promise<void>;
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }
export interface RouterT {
  routes: Route[];
  get(p: string, h: Handler): void; post(p: string, h: Handler): void; put(p: string, h: Handler): void;
  patch(p: string, h: Handler): void; delete(p: string, h: Handler): void;
}

export function Router(): RouterT {
  const routes: Route[] = [];
  const add = (method: string) => (path: string, handler: Handler) => {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_m, k) => (keys.push(k), '([^/]+)')) + '/?$');
    routes.push({ method, re, keys, handler });
  };
  return { routes, get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE') };
}
```

- [ ] **Step 5: `errors.ts`, `app.ts`**

`errors.ts`: убрать импорт express, оставить `HttpError`, `notFound`, `badRequest`; заменить `errorHandler` на

```ts
export function errorResponse(err: any): { status: number; body: unknown } {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.code, message: err.message, details: err.details } };
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return { status: 409, body: { error: 'duplicate', message: 'Элемент с таким названием уже существует' } };
  console.error(err);
  return { status: 500, body: { error: 'internal', message: 'Внутренняя ошибка' } };
}
```

`app.ts` целиком:

```ts
import type { Db } from './sqlite';
import { errorResponse, notFound } from './errors';
import { Res, type RouterT } from './router';
import { dependencyDictionaryRouter } from './routes/dependency-dictionary';
import { entitiesRouter } from './routes/entities';
import { exportRouter } from './routes/export';
import { intentsRouter } from './routes/intents';
import { projectsRouter } from './routes/projects';
import { promptsRouter } from './routes/prompts';
import { scenariosRouter } from './routes/scenarios';

export interface AppRequest { method: string; url: string; body?: unknown }
export interface AppResponse { status: number; headers: Record<string, string>; body: unknown }
export interface App { handle(r: AppRequest): Promise<AppResponse> }

export function createApp(db: Db): App {
  const routers: RouterT[] = [
    projectsRouter(db), entitiesRouter(db), intentsRouter(db), dependencyDictionaryRouter(db),
    promptsRouter(db), scenariosRouter(db), exportRouter(db),
  ];
  return {
    async handle({ method, url, body }) {
      const u = new URL(url, 'http://local');
      const path = u.pathname.replace(/^\/api/, '');
      const query = Object.fromEntries(u.searchParams);
      const clone = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
      for (const r of routers) {
        for (const route of r.routes) {
          if (route.method !== method) continue;
          const m = route.re.exec(path);
          if (!m) continue;
          const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          const res = new Res();
          try {
            await route.handler({ params, query, body: clone }, res);
          } catch (e) {
            const er = errorResponse(e);
            return { status: er.status, headers: {}, body: er.body };
          }
          return { status: res.statusCode, headers: res.headers, body: res.payload };
        }
      }
      const er = errorResponse(notFound('Ресурс'));
      return { status: er.status, headers: {}, body: er.body };
    },
  };
}
```

(Порядок `adjustments`/`result-codes` роутеров пока тоже включить, пока они не удалены в Task 2: добавить `adjustmentsRouter(db), resultCodesRouter(db)` в массив.)

- [ ] **Step 6: `db.ts`**

Заменить `import Database from 'better-sqlite3'`, `fs`, `path` на `import { openSqlite, type Db, type OpenOpts } from './sqlite'; export type { Db };`. Тип `Db` убрать из локального объявления. Переписать конец файла:

```ts
export async function openDb(opts: OpenOpts = {}): Promise<Db> {
  const db = await openSqlite(opts);
  const fresh = !hasTable(db, 'scenario_entities') && hasTable(db, 'scenarios');
  const freshStates = !hasTable(db, 'scenario_states');
  db.exec(SCHEMA);
  migrate(db, fresh, freshStates);
  return db;
}
```

Удалить `ensureProject`. В `migrate`/`hasColumn` заменить `db.prepare(\`PRAGMA table_info(...)\`).all()` — оно работает через адаптер без изменений. Проверить: `db.prepare('...').get(...)` на `sqlite_master` работает.

`unique.ts`, `validate.ts`: только поправить импорт `Db` из `./sqlite` (если импортируют из `./db`, оставить — `db.ts` реэкспортирует тип).

- [ ] **Step 7: Роуты и экспорт**

Во всех `core/src/routes/*.ts` заменить `import { Router } from 'express';` на `import { Router } from '../router';`. Конструкции `res.status(201).json(...)`, `res.status(204).end()`, `res.type(...).send(...)`, `res.setHeader(...)` поддерживаются шимом. `export.ts`: удалить маршрут `/backup`.

`export/docx.ts`: `Packer.toBuffer(doc)` → `Packer.toBlob(doc)`; сигнатуры `renderDocx`/`renderDocxScenario`/`pack` возвращают `Promise<Blob>`.

- [ ] **Step 8: Тестовая обвязка**

`core/test/request.ts`:

```ts
import type { App } from '../src/app';

export function request(app: App) {
  const call = (method: string) => (url: string) => {
    let body: unknown;
    const p: any = {
      send(b: unknown) { body = b; return p; },
      buffer() { return p; },
      parse() { return p; },
      then(ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
        return app.handle({ method, url, body }).then(async (r) => {
          let out = r.body;
          if (out instanceof Blob) out = Buffer.from(await out.arrayBuffer());
          return { status: r.status, headers: r.headers, body: out, text: typeof out === 'string' ? out : JSON.stringify(out) };
        }).then(ok, fail);
      },
    };
    return p;
  };
  return { get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), delete: call('DELETE') };
}
```

`core/test/helpers.ts`:

```ts
import { createApp, type App } from '../src/app';
import { openDb } from '../src/db';
import type { Db } from '../src/sqlite';

export function createProject(db: Db, name = 'P'): number {
  return Number(db.prepare('INSERT INTO projects(name, description) VALUES (?, ?)').run(name, '').lastInsertRowid);
}

export async function makeApp(): Promise<{ app: App; db: Db }> {
  const db = await openDb();
  return { db, app: createApp(db) };
}
```

В каждом `core/test/*.test.ts`: `import request from 'supertest'` → `import { request } from './request'`; `makeApp()` → `await makeApp()` (тесты, где вызов без `await`, сделать `async`). Блоки `.buffer(true).parse(...)` оставить как есть (шим игнорирует). В `export.test.ts` убрать зависимость от заголовка `content-disposition`, если проверяется (в шиме он в `headers`).

В `core/src/index.ts`:

```ts
export { createApp } from './app';
export type { App, AppRequest, AppResponse } from './app';
export { openDb } from './db';
export type { Db } from './sqlite';
```

Тесты `projects.test.ts` про «единственный проект» и `ensureProject` пока пометить `it.skip` — их заменит Task 3. `migrate.test.ts`, `adjustments.test.ts` — адаптировать только под async-API; они удаляются в Task 2.

- [ ] **Step 9: Прогон**

Run: `npm test -w core`
Expected: все тесты PASS (кроме явно пропущенных). Если падает `FOREIGN KEY`/`ON DELETE CASCADE`-тест — проверить, что `PRAGMA foreign_keys = ON` выставлен после `new SQL.Database(data)` и после `export()`. Если падает `JSON`/`ROW_NUMBER` — это ограничения сборки sql.js; ROW_NUMBER используется только в `migrate` (удаляется в Task 2).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "refactor: move server to core on sql.js with in-process router" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Удаление регулировок, result codes и вариаций; чистая схема

**Files:**
- Delete: `core/src/routes/adjustments.ts`, `core/src/routes/result-codes.ts`, `core/test/adjustments.test.ts`, `core/test/migrate.test.ts`
- Modify: `core/src/db.ts`, `core/src/app.ts`, `core/src/routes/{intents,entities,scenarios}.ts`, `core/src/export/{model,tables,markdown,docx}.ts`, `core/test/{intents,entities,scenarios,export,extras}.test.ts`

**Interfaces:**
- Produces: схема без `relative_adjustments`, `variant_adjustments`, `result_codes`, `intent_variants`, `variant_*`; новые таблицы `intent_phrases(id, intent_id, text, position)` и `intent_entities(id, intent_id, entity_id, required, position)`; `scenario_states` без `result_code`. Тип интента в API: `{ id, project_id, scenario_id, name, enabled: boolean, comment: string, phrases: string[], entities: { entity_id: number; required: boolean }[] }`. `ProjectSpec.intents: { name: string; phrases: string[]; entities: { name: string; required: boolean }[] }[]`; `TransitionRow` без `result_code`.

- [ ] **Step 1: Переписать тест интентов (падающий)**

В `core/test/intents.test.ts` заменить тесты вариаций/регулировок на:

```ts
it('saves phrases and entities of an intent', async () => {
  const { app, db } = await makeApp();
  const pid = createProject(db);
  const sid = (await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' })).body.id;
  const eid = (await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'Room' })).body.id;
  const iid = (await request(app).post(`/api/scenarios/${sid}/intents`).send({ name: 'Turn on' })).body.id;
  const saved = await request(app).put(`/api/intents/${iid}`).send({
    name: 'Turn on', enabled: true, comment: '', phrases: [' включи свет ', '', 'зажги свет'], entities: [{ entity_id: eid, required: true }],
  });
  expect(saved.status).toBe(200);
  expect(saved.body.phrases).toEqual(['включи свет', 'зажги свет']);
  expect(saved.body.entities).toEqual([{ entity_id: eid, required: true }]);
  expect((await request(app).get(`/api/scenarios/${sid}/intents`)).body[0]).toMatchObject({ name: 'Turn on', phrase_count: 2 });
});
```

Run: `npm test -w core -- intents` → FAIL (старая схема).

- [ ] **Step 2: Схема**

В `db.ts` удалить из `SCHEMA` таблицы `intent_variants`, `relative_adjustments`, `variant_adjustments`, `variant_phrases`, `variant_entities`, `result_codes`; удалить столбец `result_code` из `scenario_states`; добавить:

```sql
CREATE TABLE IF NOT EXISTS intent_phrases (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS intent_entities (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  required INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
```

Также убрать из `intents` столбец `group_name`, из `entities` — `followup_prompt` не трогать (используется в экспорте через scenario_entities; в таблице entities оставить как есть). В `projects` добавить `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

Удалить из `db.ts` функции `migrate`, `splitIntoParts`, `moveResultCodesToStates`, `moveResponsesToStates`, `bindToScenarios`, `splitVariants`, `hasColumn`; `openDb` становится:

```ts
export async function openDb(opts: OpenOpts = {}): Promise<Db> {
  const db = await openSqlite(opts);
  db.exec(SCHEMA);
  return db;
}
```

`hasTable` удалить, если не используется.

- [ ] **Step 3: `routes/intents.ts`**

Заменить `load`, `list` и `PUT` (остальное — create/delete — оставить, но в `create` убрать вставку в `intent_variants`):

```ts
const load = (id: number) => {
  const row = db.prepare('SELECT id, project_id, scenario_id, name, enabled, comment FROM intents WHERE id = ?').get(id) as IntentRow | undefined;
  if (!row) throw notFound('Интент');
  return {
    ...row,
    enabled: !!row.enabled,
    phrases: (db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(id) as { text: string }[]).map((p) => p.text),
    entities: (db.prepare('SELECT entity_id, required FROM intent_entities WHERE intent_id = ? ORDER BY position, id').all(id) as { entity_id: number; required: number }[])
      .map((e) => ({ entity_id: e.entity_id, required: !!e.required })),
  };
};

const list = (where: string, param: number) =>
  (db.prepare(
    `SELECT i.id, i.name, i.enabled, i.scenario_id,
            (SELECT COUNT(*) FROM intent_phrases p WHERE p.intent_id = i.id) AS phrase_count
     FROM intents i WHERE ${where} ORDER BY i.name`,
  ).all(param) as { id: number; name: string; enabled: number; scenario_id: number | null; phrase_count: number }[])
    .map((x) => ({ ...x, enabled: !!x.enabled }));
```

Тело `PUT /intents/:id`: после проверки имени —

```ts
const findEntity = db.prepare('SELECT 1 FROM entities WHERE id = ? AND project_id = ?');
const entities = (Array.isArray(b.entities) ? b.entities : []).map((e: any) => ({ entity_id: parseId(e?.entity_id), required: !!e?.required }));
for (const e of entities) if (!findEntity.get(e.entity_id, cur.project_id)) throw badRequest('Сущность не найдена в проекте');
const phrases = cleanStrings(b.phrases);
db.transaction(() => {
  db.prepare('UPDATE intents SET name = ?, enabled = ?, comment = ? WHERE id = ?').run(name, b.enabled === false ? 0 : 1, optString(b.comment), id);
  db.prepare('DELETE FROM intent_phrases WHERE intent_id = ?').run(id);
  db.prepare('DELETE FROM intent_entities WHERE intent_id = ?').run(id);
  phrases.forEach((t, i) => db.prepare('INSERT INTO intent_phrases(intent_id, text, position) VALUES (?, ?, ?)').run(id, t, i));
  entities.forEach((e: any, i: number) => db.prepare('INSERT INTO intent_entities(intent_id, entity_id, required, position) VALUES (?, ?, ?, ?)').run(id, e.entity_id, e.required ? 1 : 0, i));
})();
res.json(load(id));
```

- [ ] **Step 4: `routes/entities.ts`, `routes/scenarios.ts`, `app.ts`**

`entities.ts` `usedBy`: 

```sql
SELECT DISTINCT i.id, i.name, i.scenario_id FROM intent_entities ie
JOIN intents i ON i.id = ie.intent_id WHERE ie.entity_id = ? ORDER BY i.name
```

`scenarios.ts`: удалить `result_code` из `StateInfo`, `cleanLayout`, SELECT состояний, `loadPart` (оба места), `INSERT INTO scenario_states` (убрать столбец и аргумент `st.result_code`) и условие `|| st.result_code`. В `app.ts` убрать `adjustmentsRouter`, `resultCodesRouter`. Удалить файлы `adjustments.ts`, `result-codes.ts`, их тесты, `migrate.test.ts`.

- [ ] **Step 5: Экспорт-модель**

`export/model.ts`: интенты —

```ts
const intents = (db.prepare('SELECT id, name FROM intents WHERE project_id = ? ORDER BY id').all(projectId) as { id: number; name: string }[])
  .filter((i) => !scope || scope.intentIds.has(i.id))
  .map((i) => ({
    name: i.name,
    phrases: (db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(i.id) as { text: string }[]).map((p) => p.text),
    entities: (db.prepare(
      `SELECT e.name, ie.required FROM intent_entities ie JOIN entities e ON e.id = ie.entity_id WHERE ie.intent_id = ? ORDER BY ie.position, ie.id`,
    ).all(i.id) as { name: string; required: number }[]).map((e) => ({ name: e.name, required: !!e.required })),
  }));
```

Тип в `ProjectSpec.intents` — как в Interfaces. В `loadScenarioDoc` запрос сущностей интентов: `SELECT entity_id FROM intent_entities WHERE intent_id = ?`. Удалить `result_code` из `TransitionRow`, `stateInfo` (SELECT и тип), из SQL-строки переходов (`'' AS result_code`), и из `strip` (ветки `result_code`).

- [ ] **Step 6: Прогон и проверка зачистки**

Run: `npm test -w core` → PASS (экспортные тесты, зависящие от старых заголовков/колонок, обновит Task 4 — пока допустимо пометить их `it.skip` с комментарием «Task 4»).
Run: `grep -rniE "adjustment|result_code|result-codes|variant" core/src core/test` → пусто.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(core): remove adjustments, result codes and intent variants" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Несколько проектов, дубли, импорт/экспорт JSON, демо-данные

**Files:**
- Create: `core/src/project-dump.ts`, `core/src/demo.ts`, `core/test/project-dump.test.ts`
- Modify: `core/src/routes/projects.ts`, `core/src/index.ts`, `core/test/projects.test.ts`

**Interfaces:**
- Produces (HTTP-подобный API):
  - `GET /api/projects` → `{ id, name, description, scenario_count, created_at }[]`
  - `POST /api/projects` `{name, description?}` → 201 `{id, name, description}`
  - `PATCH /api/projects/:id`, `DELETE /api/projects/:id` → 204
  - `POST /api/projects/:id/duplicate` → 201 `{id, name}` (имя «… (копия)»)
  - `GET /api/projects/:id/dump` → `ProjectDump`
  - `POST /api/projects/import` `ProjectDump` → 201 `{id, name}`
  - `dumpProject(db, id): ProjectDump`, `importProject(db, dump, name?): number`, `seedDemo(app: App): Promise<number>`.

- [ ] **Step 1: Падающие тесты**

`core/test/projects.test.ts` (заменить содержимое):

```ts
import { describe, expect, it } from 'vitest';
import { request } from './request';
import { makeApp } from './helpers';

const mk = async (app: any, name: string) => (await request(app).post('/api/projects').send({ name })).body.id as number;

describe('projects API', () => {
  it('creates, lists, renames and deletes projects', async () => {
    const { app } = await makeApp();
    const a = await mk(app, 'Альфа');
    await mk(app, 'Бета');
    expect((await request(app).get('/api/projects')).body).toHaveLength(2);
    expect((await request(app).patch(`/api/projects/${a}`).send({ name: 'Альфа 2' })).body.name).toBe('Альфа 2');
    expect((await request(app).delete(`/api/projects/${a}`)).status).toBe(204);
    expect((await request(app).get('/api/projects')).body).toHaveLength(1);
    expect((await request(app).patch(`/api/projects/${a}`).send({ name: 'X' })).status).toBe(404);
  });

  it('rejects an empty name', async () => {
    const { app } = await makeApp();
    expect((await request(app).post('/api/projects').send({ name: ' ' })).status).toBe(400);
  });
});
```

`core/test/project-dump.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { request } from './request';
import { makeApp } from './helpers';
import { seedDemo } from '../src/demo';

describe('project duplicate / import', () => {
  it('duplicates a project with all content and keeps references consistent', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const dup = (await request(app).post(`/api/projects/${src}/duplicate`)).body;
    expect(dup.name).toMatch(/\(копия\)$/);
    const sc = (id: number) => request(app).get(`/api/projects/${id}/scenarios`);
    const [a, b] = [(await sc(src)).body, (await sc(dup.id)).body];
    expect(b).toHaveLength(a.length);
    const full = (await request(app).get(`/api/scenarios/${b[0].id}`)).body;
    expect(full.project_id).toBe(dup.id);
    const intents = (await request(app).get(`/api/projects/${dup.id}/intents`)).body;
    expect(intents.length).toBeGreaterThan(0);
    // удаление исходного проекта не ломает копию
    await request(app).delete(`/api/projects/${src}`);
    expect((await request(app).get(`/api/scenarios/${b[0].id}`)).status).toBe(200);
  });

  it('exports and imports a dump', async () => {
    const { app } = await makeApp();
    const src = await seedDemo(app);
    const dump = (await request(app).get(`/api/projects/${src}/dump`)).body;
    const imp = await request(app).post('/api/projects/import').send(dump);
    expect(imp.status).toBe(201);
  });

  it('rejects a malformed or hostile dump', async () => {
    const { app } = await makeApp();
    expect((await request(app).post('/api/projects/import').send({ version: 2 })).status).toBe(400);
    const bad = { version: 1, name: 'X', description: '', tables: { entities: [{ 'name) VALUES (1); DROP TABLE projects; --': 'x' }] } };
    expect((await request(app).post('/api/projects/import').send(bad)).status).toBe(400);
  });
});
```

Run: `npm test -w core -- projects project-dump` → FAIL.

- [ ] **Step 2: `project-dump.ts`**

```ts
import { badRequest, notFound } from './errors';
import type { Db } from './sqlite';

export interface ProjectDump {
  version: 1;
  name: string;
  description: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const IN_PROJECT = 'project_id = ?';
const VIA_SCENARIO = 'scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?)';
const VIA_INTENT = 'intent_id IN (SELECT id FROM intents WHERE project_id = ?)';
const VIA_ENTITY = 'entity_id IN (SELECT id FROM entities WHERE project_id = ?)';

/** Порядок важен: родители раньше детей. fk — столбцы-ссылки на id других таблиц дампа. */
const TABLES: { name: string; where: string; fk: Record<string, string> }[] = [
  { name: 'entities', where: IN_PROJECT, fk: {} },
  { name: 'entity_values', where: VIA_ENTITY, fk: { entity_id: 'entities' } },
  { name: 'dependency_dictionary', where: IN_PROJECT, fk: {} },
  { name: 'scenarios', where: IN_PROJECT, fk: {} },
  { name: 'scenario_parts', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios' } },
  { name: 'intents', where: IN_PROJECT, fk: { scenario_id: 'scenarios' } },
  { name: 'intent_phrases', where: VIA_INTENT, fk: { intent_id: 'intents' } },
  { name: 'intent_entities', where: VIA_INTENT, fk: { intent_id: 'intents', entity_id: 'entities' } },
  { name: 'prompts', where: IN_PROJECT, fk: { scenario_id: 'scenarios' } },
  { name: 'scenario_dependencies', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', entity_id: 'entities' } },
  { name: 'scenario_entities', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', entity_id: 'entities' } },
  { name: 'scenario_states', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', part_id: 'scenario_parts', prompt_id: 'prompts' } },
  { name: 'scenario_steps', where: VIA_SCENARIO, fk: { scenario_id: 'scenarios', part_id: 'scenario_parts', intent_id: 'intents', prompt_id: 'prompts' } },
];

export function dumpProject(db: Db, id: number): ProjectDump {
  const p = db.prepare('SELECT name, description FROM projects WHERE id = ?').get(id) as { name: string; description: string } | undefined;
  if (!p) throw notFound('Проект');
  const tables: ProjectDump['tables'] = {};
  for (const t of TABLES) tables[t.name] = db.prepare(`SELECT * FROM ${t.name} WHERE ${t.where}`).all(id);
  return { version: 1, name: p.name, description: p.description, tables };
}

/** Импорт: id пересоздаются, ссылки переписываются. Имена столбцов проверяются по схеме. */
export function importProject(db: Db, dump: ProjectDump, name?: string): number {
  if (!dump || dump.version !== 1 || typeof dump.name !== 'string' || !dump.tables || typeof dump.tables !== 'object') {
    throw badRequest('Файл не похож на экспорт проекта VA Spec Maker');
  }
  return db.transaction(() => {
    const pid = Number(
      db.prepare('INSERT INTO projects(name, description) VALUES (?, ?)').run(name ?? dump.name, typeof dump.description === 'string' ? dump.description : '').lastInsertRowid,
    );
    const maps: Record<string, Map<number, number>> = {};
    for (const t of TABLES) {
      const cols = new Set((db.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string }[]).map((c) => c.name));
      const map = (maps[t.name] = new Map());
      for (const row of dump.tables[t.name] ?? []) {
        const keys = Object.keys(row).filter((k) => k !== 'id');
        if (keys.some((k) => !cols.has(k))) throw badRequest(`Неизвестное поле в таблице ${t.name}`);
        const values = keys.map((k) => {
          if (k === 'project_id') return pid;
          const ref = t.fk[k];
          if (!ref) return row[k] as unknown;
          const old = row[k] as number | null;
          return old == null ? null : (maps[ref].get(old) ?? null);
        });
        const q = keys.map((k) => `"${k}"`).join(', ');
        const info = db.prepare(`INSERT INTO ${t.name}(${q}) VALUES (${keys.map(() => '?').join(', ')})`).run(...values);
        if (typeof row.id === 'number') map.set(row.id, Number(info.lastInsertRowid));
      }
    }
    return pid;
  })();
}
```

- [ ] **Step 3: `routes/projects.ts`**

Дополнить существующий файл (оставить `get` и `PATCH`, но `PATCH` должен возвращать 404 для неизвестного id — уже так через `notFound`):

```ts
import { dumpProject, importProject } from '../project-dump';

r.get('/projects', (_req, res) => {
  res.json(db.prepare(
    `SELECT p.id, p.name, p.description, p.created_at,
            (SELECT COUNT(*) FROM scenarios s WHERE s.project_id = p.id) AS scenario_count
     FROM projects p ORDER BY p.created_at DESC, p.id DESC`,
  ).all());
});

r.post('/projects', (req, res) => {
  const name = requireString(req.body?.name, 'Название');
  const description = optString(req.body?.description);
  const id = Number(db.prepare('INSERT INTO projects(name, description) VALUES (?, ?)').run(name, description).lastInsertRowid);
  res.status(201).json({ id, name, description });
});

r.delete('/projects/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!get(id)) throw notFound('Проект');
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.status(204).end();
});

r.post('/projects/:id/duplicate', (req, res) => {
  const id = parseId(req.params.id);
  const dump = dumpProject(db, id);
  const name = `${dump.name} (копия)`;
  res.status(201).json({ id: importProject(db, dump, name), name });
});

r.get('/projects/:id/dump', (req, res) => {
  res.json(dumpProject(db, parseId(req.params.id)));
});

r.post('/projects/import', (req, res) => {
  const id = importProject(db, req.body);
  res.status(201).json({ id, name: (get(id) as { name: string }).name });
});
```

Важно: маршрут `POST /projects/import` объявлять ДО `POST /projects/:id/...` (в данном случае пути различаются числом сегментов, конфликта нет). Для `CREATE TABLE projects` проверить, что `created_at` добавлен (Task 2 Step 2).

- [ ] **Step 4: `demo.ts`**

Демо-проект «Демо: умный дом» создаётся через `app.handle` (так он проходит ту же валидацию):

```ts
import type { App } from './app';

async function call<T = any>(app: App, method: string, url: string, body?: unknown): Promise<T> {
  const r = await app.handle({ method, url, body });
  if (r.status >= 400) throw new Error(`demo seed ${method} ${url}: ${JSON.stringify(r.body)}`);
  return r.body as T;
}

export async function seedDemo(app: App): Promise<number> {
  const { id: pid } = await call(app, 'POST', '/api/projects', { name: 'Демо: умный дом', description: 'Пример проекта: управление светом голосом.' });
  const { id: room } = await call(app, 'POST', `/api/projects/${pid}/entities`, { name: 'ROOM' });
  await call(app, 'PUT', `/api/entities/${room}`, {
    name: 'ROOM', description: 'Комната', multiple_values: false,
    values: [{ value: 'kitchen', synonyms: ['кухня', 'на кухне'] }, { value: 'bedroom', synonyms: ['спальня', 'в спальне'] }],
  });
  const { id: sid } = await call(app, 'POST', `/api/projects/${pid}/scenarios`, { name: 'Управление светом' });
  const { id: on } = await call(app, 'POST', `/api/scenarios/${sid}/intents`, { name: 'LIGHT_ON' });
  await call(app, 'PUT', `/api/intents/${on}`, {
    name: 'LIGHT_ON', enabled: true, comment: '',
    phrases: ['включи свет', 'зажги свет в комнате', 'включи свет на кухне'],
    entities: [{ entity_id: room, required: true }],
  });
  const { id: ask } = await call(app, 'POST', `/api/scenarios/${sid}/prompts`, { name: 'PRM_ASK_ROOM' });
  await call(app, 'PUT', `/api/prompts/${ask}`, { name: 'PRM_ASK_ROOM', full_answers: ['В какой комнате включить свет?'], short_answers: ['В какой?'] });
  const { id: done } = await call(app, 'POST', `/api/scenarios/${sid}/prompts`, { name: 'PRM_DONE' });
  await call(app, 'PUT', `/api/prompts/${done}`, { name: 'PRM_DONE', full_answers: ['Свет включён.'], short_answers: ['Готово.'] });
  const sc = await call(app, 'GET', `/api/scenarios/${sid}`);
  await call(app, 'PUT', `/api/scenarios/${sid}`, {
    ...sc,
    description: 'Пользователь просит включить свет; если комната не названа, ассистент уточняет.',
    entities: [{ entity_id: room, followup_prompt: 'В какой комнате?', required: true, is_array: false }],
    parts: [{
      name: 'Управление светом', description: '',
      steps: [
        { kind: 'transition', state: 'START', intent_id: on, any_intent: false, request_params: '', condition: '', conditions: [], prompt_id: null, system_action: '', next_states: 'ASK_ROOM' },
        { kind: 'transition', state: 'ASK_ROOM', intent_id: null, any_intent: true, request_params: '', condition: '', conditions: [], prompt_id: null, system_action: '', next_states: 'DONE' },
      ],
      layout: {
        START: { x: 0, y: 0, description: 'Вход в сценарий', prompt_id: null, system_action: '' },
        ASK_ROOM: { x: 280, y: 0, description: 'Уточнение комнаты', prompt_id: ask, system_action: '' },
        DONE: { x: 560, y: 0, description: 'Свет включён', prompt_id: done, system_action: 'Включить свет в выбранной комнате' },
      },
    }],
  });
  return pid;
}
```

Перед запуском сверить форму PUT-тела сценария и промпта с `routes/scenarios.ts` и `routes/prompts.ts` (поля `full_answers`/`short_answers`); при расхождении поправить демо, а не роуты. Добавить `export { seedDemo } from './demo'; export { dumpProject, importProject } from './project-dump';` в `core/src/index.ts`.

- [ ] **Step 5: Прогон и commit**

Run: `npm test -w core` → PASS.

```bash
git add -A && git commit -m "feat(core): multiple projects, duplicate, JSON import/export, demo seed" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Спецификации на русском

**Files:**
- Modify: `core/src/export/{tables,markdown,docx}.ts`, `core/test/export.test.ts`

**Interfaces:**
- Produces: русские константы `INTENTS_HEAD`, `ENTITIES_HEAD`, `PROMPTS_HEAD`, `DEPENDENCIES_HEAD`, `TRANSITION_HEAD`; русские заголовки разделов в MD и DOCX.

- [ ] **Step 1: Падающий тест**

В `core/test/export.test.ts` оставить существующие тесты данных, но заменить ожидания на русские; добавить:

```ts
it('renders the Markdown spec in Russian', async () => {
  const { app } = await makeApp();
  const pid = await seedDemo(app);
  const sid = (await request(app).get(`/api/projects/${pid}/scenarios`)).body[0].id;
  const md = (await request(app).get(`/api/scenarios/${sid}/export?format=md`)).text;
  for (const h of ['## Интенты', '## Сущности', '## Промпты', '## Переходы между состояниями', '## Ошибки']) expect(md).toContain(h);
  expect(md).toContain('| Интент | Фразы для обучения | Сущности |');
  expect(md).toContain('| Из состояния | Запрос пользователя | Условия | Действие системы | В состояние | Ответ ассистента |');
  expect(md).toContain('(обязательно)');
  expect(md).not.toMatch(/Result code|State from|Relative adjustment|\(required\)/);
});
```

(`text` для MD: роут отдаёт строку, шим кладёт её в `text`.) Run → FAIL.

- [ ] **Step 2: `tables.ts`**

Заменить константы и тексты:

```ts
export const INTENTS_HEAD = ['Интент', 'Фразы для обучения', 'Сущности'];
// intentsTable: widths [20, 50, 30]; строка на интент:
rows: spec.intents.map((i): Row => ({
  cells: [text(i.name), list(i.phrases), list(i.entities.map((e) => ref(e.name) + (e.required ? ' (обязательно)' : '')))],
})),

export const ENTITIES_HEAD = ['Сущность', 'Значения', 'Несколько значений', 'Обязательная', 'Уточняющий вопрос'];
// 'yes'/'no' -> 'да'/'нет' (три места)

export const PROMPTS_HEAD = ['Промпт', 'Полный ответ', 'Краткий ответ'];
export const DEPENDENCIES_HEAD = ['Сценарий', 'Зависимость', 'Тип', 'Значения'];

export const TRANSITION_HEAD = ['Из состояния', 'Запрос пользователя', 'Условия', 'Действие системы', 'В состояние', 'Ответ ассистента'];
// transitionRow: убрать последнюю ячейку dash(t.result_code); widths [14, 17, 17, 17, 20, 15]
```

`span0` и вертикальное объединение для интентов больше не нужны (оставить поддержку в `docx.ts`/`markdown.ts` — не мешает, либо удалить как мёртвый код, если нигде не используется).

- [ ] **Step 3: Заголовки разделов**

`markdown.ts` `section()`: `'## Intents'` → `'## Интенты'`, `'## Entities'` → `'## Сущности'`, `'## Prompts'` → `'## Промпты'`, `'## State transitions'` → `'## Переходы между состояниями'`, `'## Errors'` → `'## Ошибки'`. `docx.ts` `sectionBlocks()`: те же пять заголовков в `heading(...)`.

- [ ] **Step 4: Прогон и commit**

Run: `npm test -w core` → PASS. Проверить, что в `core/src/export` не осталось английских слов-меток: `grep -rnE "Intents|Entities|Prompts|State |Errors|yes|no'" core/src/export`.

```bash
git add -A && git commit -m "feat(core): generate specs in Russian" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Веб-клиент работает поверх `core` (без сервера), данные в IndexedDB

**Files:**
- Create: `web/src/lib/backend.ts`, `web/src/lib/download.ts`
- Modify: `web/src/lib/api.ts`, `web/src/main.tsx`, `web/vite.config.ts`, `web/src/components/ExportMenu.tsx`

**Interfaces:**
- Consumes: `@va/core` (`createApp`, `openDb`, `seedDemo`, `type App`, `type Db`), `ApiError` из `api.ts`.
- Produces: `initBackend(): Promise<void>`; `request<T>(method, url, body?): Promise<{ status; headers; body }>`; `downloadResponse(r: AppResponse, fallbackName: string): void`; `api.export.scenario(id, fmt)`, `api.export.project(id, fmt)`, `api.projects.{list,create,rename,remove,duplicate,exportJson,importJson}`.

- [ ] **Step 1: `web/src/lib/backend.ts`**

```ts
import { createApp, openDb, seedDemo, type App, type AppResponse, type Db } from '@va/core';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const IDB = 'va-spec-maker';
const KEY = 'db';
let app: App;
let db: Db;
let timer: ReturnType<typeof setTimeout> | undefined;

const idb = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const r = run(open.result.transaction('kv', mode).objectStore('kv'));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    };
  });

const load = (): Promise<Uint8Array | undefined> => idb('readonly', (s) => s.get(KEY)).catch(() => undefined);
const persist = () => {
  clearTimeout(timer);
  timer = setTimeout(() => { idb('readwrite', (s) => s.put(db.serialize(), KEY)).catch(() => {}); }, 300);
};

export async function initBackend(): Promise<void> {
  const data = await load();
  db = await openDb({ data, locateFile: () => wasmUrl });
  app = createApp(db);
  if (!data) {
    await seedDemo(app);
    persist();
  }
}

export async function request(method: string, url: string, body?: unknown): Promise<AppResponse> {
  const r = await app.handle({ method, url, body });
  if (method !== 'GET' && r.status < 400) persist();
  return r;
}
```

Установка: `npm i sql.js -w web` (для `?url` импорта), `@types/sql.js` не нужен. В `web/src/vite-env.d.ts` (создать при отсутствии) должно быть `/// <reference types="vite/client" />`.

- [ ] **Step 2: `api.ts` — транспорт**

Заменить `req` (оставить `ApiError`):

```ts
import { request } from './backend';

export async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await request(method, url, body);
  if (r.status >= 400) {
    const j = (r.body ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiError(r.status, j.error ?? 'error', j.message ?? 'Ошибка', j.details);
  }
  return (r.status === 204 ? undefined : r.body) as T;
}
```

Удалить из `api` разделы `adjustments`, `resultCodes`, `exportUrl`, `projectExportUrl`, `backupUrl`; `preview` → `req<string>('GET', \`/api/scenarios/${id}/preview\`)`. Раздел `projects`:

```ts
projects: {
  list: () => req<ProjectListItem[]>('GET', '/api/projects'),
  create: (name: string, description = '') => req<{ id: number; name: string }>('POST', '/api/projects', { name, description }),
  rename: (id: number, body: { name: string; description: string }) => req<Project>('PATCH', `/api/projects/${id}`, body),
  remove: (id: number) => req<void>('DELETE', `/api/projects/${id}`),
  duplicate: (id: number) => req<{ id: number; name: string }>('POST', `/api/projects/${id}/duplicate`),
  dump: (id: number) => req<unknown>('GET', `/api/projects/${id}/dump`),
  import: (dump: unknown) => req<{ id: number; name: string }>('POST', '/api/projects/import', dump),
},
exportFile: async (url: string, fallback: string) => downloadResponse(await request('GET', url), fallback),
```

В `types.ts` добавить `export interface ProjectListItem extends Project { scenario_count: number; created_at: string }`.

- [ ] **Step 3: `web/src/lib/download.ts`**

```ts
import type { AppResponse } from '@va/core';

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Имя берётся из Content-Disposition (filename*=UTF-8''...), иначе — запасное. */
export function downloadResponse(r: AppResponse, fallback: string): void {
  const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers['content-disposition'] ?? '');
  const name = m ? decodeURIComponent(m[1]) : fallback;
  const blob = r.body instanceof Blob ? r.body : new Blob([typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2)], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, name);
}
```

- [ ] **Step 4: `ExportMenu`, `main.tsx`, `vite.config.ts`**

`ExportMenu`: `go(url)` → `api.exportFile(url, 'spec')`; пункты берут URL из строк `/api/scenarios/${id}/export?format=md|docx` и `/api/projects/${projectId}/export?format=...`; пункт «Резервная копия базы» удалить (бэкапы — через JSON на странице проектов).

`main.tsx`: `BrowserRouter` → `HashRouter`; обернуть запуск: 

```ts
initBackend().then(() => createRoot(document.getElementById('root')!).render(/* как сейчас */));
```

`vite.config.ts`: убрать `server.proxy`; добавить `base: process.env.BASE_PATH ?? '/'`; в `test.include` оставить как есть.

- [ ] **Step 5: Проверка**

Run: `npm run typecheck -w web` (допустимы ошибки только в файлах, которые чистит Task 6 — страницы регулировок/кодов, IntentsTable, state-editor). Временная проверка: `npm run dev -w web`, открыть http://localhost:5173 — демо-проект загружается, сценарий открывается, правка сохраняется и переживает перезагрузку страницы (IndexedDB), «Экспорт → Markdown» скачивает русский файл.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): run core in the browser with IndexedDB persistence" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Удаление регулировок / result codes / вариаций из интерфейса

**Files:**
- Delete: `web/src/pages/adjustments/`, `web/src/pages/result-codes/`
- Modify: `web/src/App.tsx`, `web/src/pages/DictionariesLayout.tsx`, `web/src/components/CommandPalette.tsx`, `web/src/lib/types.ts`, `web/src/pages/intents/IntentsTable.tsx`, `web/src/pages/scenarios/state-editor/{NodePanel,StateEditor}.tsx`, `web/src/pages/scenarios/StepsTable.tsx`, `web/src/pages/scenarios/ScenarioForm.tsx`

**Interfaces:**
- Consumes: API интента из Task 2 (`phrases`, `entities` на верхнем уровне).
- Produces: `Intent = { id; project_id; name; enabled; comment; phrases: string[]; entities: IntentEntity[] }`.

- [ ] **Step 1: Типы и справочники**

`types.ts`: удалить `IntentVariant`, `Adjustment`, `AdjustmentListItem`, `ResultCode`, `ResultCodeListItem`; `Intent` переопределить как в Interfaces; из `StateInfo` убрать `result_code`. `DictionariesLayout.DICTIONARIES` оставить только `Сущности` и `Зависимости`. `App.tsx`: убрать маршруты `adjustments` и `result-codes`. `CommandPalette.tsx`: убрать запросы `adjustments`, `codes`, их элементы в списке и из массива зависимостей `useMemo`.

- [ ] **Step 2: `IntentsTable.tsx` без вариаций**

Переписать таблицу: строка интента = название + переключатель «включён» + `EntitiesCell` + `PhrasesCell` + кнопка удаления. Убрать `emptyVariant`, `withKeys` (оставить ключи только если нужны для dnd), селект регулировок и `NONE`. Сохранение: `api.intents.save(id, { name, enabled, comment, phrases, entities })`. Использовать существующие `PhrasesCell` (`value: string[]`, `onChange`) и `EntitiesCell` (`value: IntentEntity[]`) без изменений. Колонки: «Интент», «Фразы для обучения», «Сущности», «Вкл.».

- [ ] **Step 3: Состояния и таблица переходов**

`NodePanel.tsx`: убрать проп `resultCodes`, переменные `current`/`names`/`codeOptions`, `<Select>` кода результата и его подпись. `StateEditor.tsx`: убрать запрос `codes`, `resultCodes`, проп при рендере `NodePanel`. `StepsTable.tsx`: убрать проп `resultCode`, колонку и ячейку «Result code» (и `showCode`); соответствующий заголовок колонки. `ScenarioForm.tsx`: убрать передачу `layout`-кодов, если они там используются для `showCode`.

- [ ] **Step 4: Проверка**

Run: `npm run typecheck -w web && npm test -w web` → PASS. `grep -rniE "adjustment|resultCode|result_code|result-codes|Регулиров|Result code" web/src` → пусто. Ручная проверка в `npm run dev`: нет пунктов «Относительные регулировки»/«Result codes», интент редактируется и сохраняется, панель состояния без кода результата.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): remove adjustments, result codes and intent variants UI" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Страница проектов и маршруты `/p/:projectId`

**Files:**
- Create: `web/src/pages/projects/ProjectsPage.tsx`, `web/src/components/ProjectSwitcher.tsx`, `web/src/pages/projects/ProjectLayout.tsx`
- Modify: `web/src/App.tsx`, `web/src/hooks/project.tsx`, `web/src/components/AppShell.tsx`, и все страницы с абсолютными ссылками (`grep -rnE "to=\"/|navigate\(.?/|Navigate to=|to: '/|\`/(scenarios|entities|dependencies)" web/src`)

**Interfaces:**
- Consumes: `api.projects.*`, `downloadBlob`.
- Produces: `useProject()` читает `projectId` из `useParams`; `useProjectId(): number`; новый хук `usePath(): (suffix: string) => string` → `/p/${id}${suffix}`.

- [ ] **Step 1: Контекст проекта**

`hooks/project.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectListItem } from '@/lib/types';

interface Ctx { project: ProjectListItem | null; isLoading: boolean }
const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { projectId } = useParams();
  const { data = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  const project = data.find((p) => String(p.id) === projectId) ?? null;
  return <ProjectCtx.Provider value={{ project, isLoading }}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx { const c = useContext(ProjectCtx); if (!c) throw new Error('useProject вне ProjectProvider'); return c; }
export function useProjectId(): number { const { project } = useProject(); if (!project) throw new Error('Проект не выбран'); return project.id; }
export function usePath(): (suffix: string) => string { const id = useProjectId(); return (s) => `/p/${id}${s}`; }
```

`ProjectLayout.tsx`: оборачивает `<ProjectProvider>`; если проекты загружены, а нужного нет — `<Navigate to="/" replace />`; иначе `<AppShell />`.

- [ ] **Step 2: Маршруты**

`App.tsx`:

```tsx
<Routes>
  <Route index element={<ProjectsPage />} />
  <Route path="p/:projectId" element={<ProjectLayout />}>
    <Route index element={<Navigate to="scenarios" replace />} />
    <Route element={<DictionariesLayout />}>
      <Route path="entities" element={<EntitiesPage />} />
      <Route path="dependencies" element={<DependenciesPage />} />
    </Route>
    <Route path="scenarios" element={<ScenariosPage />} />
    <Route path="scenarios/:id" element={<ScenariosPage />} />
    <Route path="scenarios/:id/:tab" element={<ScenariosPage />} />
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

Пройти по результатам grep из списка Files и заменить все абсолютные пути внутри проекта на `usePath()` (например `navigate(path(\`/scenarios/${id}/${tab}\`))`), включая `DICTIONARIES[].to` (сделать относительными: `entities`, `dependencies`), `AppShell` (`isActive` сравнивать с `path(...)`), `CommandPalette`, `ScenarioForm` (вкладки), `ScenarioList`, `ScenariosPage`.

- [ ] **Step 3: `ProjectsPage`**

Содержимое: заголовок «Проекты», кнопки «Новый проект» (`CreateDialog`, существующий компонент), «Импорт» (скрытый `<input type="file" accept=".json">` → `api.projects.import(JSON.parse(text))`, ошибки — `toast.error`). Сетка карточек (`grid sm:grid-cols-2 lg:grid-cols-3 gap-4`): название, описание, «N сценариев», дата создания; клик по карточке — `navigate(\`/p/${id}/scenarios\`)`; меню «⋯» (`DropdownMenu`): «Переименовать» (диалог с названием/описанием → `api.projects.rename`), «Дублировать», «Экспорт (.json)» (`api.projects.dump` → `downloadBlob(new Blob([JSON.stringify(d, null, 2)]), \`${name}.json\`)`), «Удалить» (`ConfirmDialog`). После любой мутации — `qc.invalidateQueries({ queryKey: ['projects'] })`. Пустое состояние: «Создайте первый проект или импортируйте файл».

- [ ] **Step 4: `ProjectSwitcher` и шапка/сайдбар**

`ProjectSwitcher`: `DropdownMenu` с названием текущего проекта; пункты — остальные проекты (переход на `/p/:id/scenarios`) и «Все проекты» (`/`). В `AppShell` показывать его вместо старого заголовка `{project.name} VA Spec Maker`; логотип/название приложения — «VA Spec Maker» со ссылкой на `/`.

- [ ] **Step 5: Проверка и commit**

Run: `npm run typecheck -w web && npm test -w web` → PASS. Ручная проверка в `npm run dev`: создать два проекта, в каждом свой набор сущностей/сценариев (данные не пересекаются), переключатель работает, прямой заход по `#/p/1/scenarios/2/logic` и перезагрузка страницы открывают нужный экран, удаление проекта возвращает на `/`, экспорт JSON → импорт создаёт копию.

```bash
git add -A && git commit -m "feat(web): multiple projects with list page and project routes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Дизайн в духе Dropbox

**Files:**
- Modify: `web/src/index.css`, `web/src/components/AppShell.tsx`, `web/src/components/ui/{button,input,table,dialog,dropdown-menu,select,badge}.tsx` (только классы), `web/src/components/{Section,MasterDetail,GlobalSaveStatus,SaveIndicator}.tsx`, `web/src/pages/projects/ProjectsPage.tsx`

Перед началом вызвать skill `impeccable:impeccable` (frontend-design) и следовать ему; ниже — обязательные параметры дизайна.

**Interfaces:**
- Consumes: существующие токены Tailwind (`--brand`, `--page`, `--border`, `--radius` и т.д.).
- Produces: обновлённые значения токенов; структура AppShell: левый сайдбар вместо верхней шапки.

- [ ] **Step 1: Токены в `index.css`**

Заменить значения в `:root` (светлая тема — единственная; тёмные переменные оставить как есть, но тему не переключать):

```css
:root {
  --brand: #0061fe;                 /* Dropbox blue */
  --background: #ffffff;
  --page: #f7f5f2;                  /* тёплый off-white фон рабочей области */
  --foreground: #1e1919;
  --muted: #f1efec;
  --muted-foreground: #6f6a63;
  --border: #e5e1da;
  --input: #d6d1c8;
  --ring: #0061fe;
  --primary: #0061fe;
  --primary-foreground: #ffffff;
  --radius: 0.625rem;
}
```

Тени: убрать `shadow-*` у карточек/секций (использовать только `border`). Шрифт — Inter Variable (уже подключён), межстрочный 1.5, заголовки `font-semibold tracking-tight`.

- [ ] **Step 2: Каркас приложения**

`AppShell`: `flex h-screen`; слева сайдбар 240px, `bg-background`, `border-r`: сверху «VA Spec Maker» (синий знак + текст), под ним `ProjectSwitcher`, далее навигация («Сценарии», «Справочники») — пункты высотой 36px, скругление 8px, активный — `bg-brand/10 text-brand`; внизу — поиск (Ctrl K) и `GlobalSaveStatus`. Основная область — `bg-page`, содержимое в белых секциях с `rounded-xl border`, отступы 24px. Верхняя тёмная шапка (`--nav*`) удаляется вместе с неиспользуемыми токенами `--nav*`.

- [ ] **Step 3: Компоненты**

Кнопки: primary — заливка `--brand`, `rounded-lg`, высота 36px, без тени; secondary/outline — белый фон, рамка `--border`, hover `--muted`; ghost без рамки. Поля ввода: высота 36px, рамка `--input`, фокус — кольцо 2px `--brand`. Таблицы: заголовок `text-xs uppercase tracking-wide text-muted-foreground`, строки с разделителем `border-b`, hover `bg-muted/50`, без зебры. Карточки проектов: белые, `rounded-xl border`, hover — рамка `--brand/40`; пустые состояния: крупная иконка lucide, заголовок, одно действие.

- [ ] **Step 4: Проверка**

Запустить `npm run dev -w web`, пройти экраны: проекты, сценарий (все 6 вкладок), редактор состояний, справочники, диалоги, поиск. Проверить: контраст текста (≥ 4.5:1), видимый фокус, ширину 1280 и 390 px (без горизонтального скролла страницы; на узком экране сайдбар сворачивается в верхнюю панель). Если доступен встроенный браузер — сделать скриншоты ключевых экранов.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): Dropbox-style visual redesign" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Публичный репозиторий и деплой на GitHub Pages

**Files:**
- Create: `LICENSE`, `.github/workflows/pages.yml`, `web/public/404.html` (не нужен при HashRouter — не создавать)
- Modify: `README.md`, `.gitignore`, `package.json`, `web/index.html`, `docs/superpowers/specs/2026-10-20-public-version-design.md`
- Delete: `docs/mockups/`

- [ ] **Step 1: Лицензия и README**

`LICENSE` — текст MIT, `Copyright (c) 2026 <правообладатель>` — имя правообладателя спросить у пользователя, не угадывать. `README.md` (на русском): название «VA Spec Maker»; описание (редактор спецификаций голосовых ассистентов: интенты, сущности, промпты, сценарии с диаграммой состояний; экспорт в DOCX и Markdown на русском; несколько проектов; все данные хранятся в браузере); ссылка на live-демо `https://<user>.github.io/<repo>/` (подставить после публикации); раздел «Запуск локально» (`npm install`, `npm run dev`, `npm run build`, `npm test`); раздел «Данные и приватность» (хранятся в IndexedDB браузера, экспорт/импорт проекта в JSON); раздел «Лицензия».

- [ ] **Step 2: Workflow**

`.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Зачистка**

`.gitignore`: `node_modules`, `web/dist`, `*.log`, `data/` (локальная база владельца, в публичный репозиторий не попадает). Удалить `docs/mockups/`. `web/index.html`: `<title>VA Spec Maker</title>`, `lang="ru"`, `<meta name="description" content="Редактор спецификаций голосовых ассистентов">`. Корневой `package.json`: `"name": "va-spec-maker"`, добавить `"license": "MIT"`. В спеке заменить пункт «Роуты переписываются в чистые функции» на описание мини-роутера (см. раздел «Отклонение от спеки» в начале плана). Поиск внутренних данных: `grep -rniE "bogatov|spec\.db|localhost:3001" . --exclude-dir=node_modules --exclude-dir=.git` — пусто, кроме LICENSE.

- [ ] **Step 4: Итоговая проверка**

Run: `npm ci` (в чистом клоне/после удаления `node_modules`), `npm test`, `BASE_PATH=/va-spec-maker/ npm run build`, `npm run preview -w web -- --base /va-spec-maker/`. Открыть превью в браузере: загрузка демо, создание второго проекта, правка сценария, перезагрузка (данные на месте), экспорт MD и DOCX — открыть DOCX и убедиться, что заголовки русские. Размер `web/dist` — посмотреть (`du -sh web/dist`), записать в итоговый отчёт.

- [ ] **Step 5: Commit и передача пользователю**

```bash
git add -A && git commit -m "chore: public repo files, README, license and Pages workflow" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

НЕ создавать удалённый репозиторий и не пушить. Сообщить пользователю: что готово, результаты проверок, и что для live-демо нужно: создать репозиторий на GitHub, `git remote add origin ...`, `git push -u origin main`, в Settings → Pages выбрать Source = «GitHub Actions». Предложить выполнить эти шаги по его команде.
