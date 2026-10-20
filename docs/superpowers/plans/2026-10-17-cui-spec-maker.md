# CUI Spec Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальный веб-сервис для описания интентов, сущностей и сценариев голосового помощника с экспортом спецификации проекта в MD и DOCX.

**Architecture:** Монорепозиторий на npm workspaces. `server/` — Express 5 + better-sqlite3, REST API с единым стилем «PUT заменяет весь объект целиком» (удобно для автосохранения). `web/` — Vite + React + Shadcn UI, данные через TanStack Query, выбранный элемент хранится в URL. В production Express сам отдаёт `web/dist` на одном порту.

**Tech Stack:** Node 24, TypeScript, Express 5, better-sqlite3, `docx`, Vitest, supertest, Vite, React 19, Tailwind v4, Shadcn UI, TanStack Query, react-router-dom, @dnd-kit.

## Global Constraints

- Данные хранятся в SQLite-файле `data/spec.db` (в `.gitignore`).
- Несколько проектов; у каждого свои интенты, сущности, сценарии.
- Сервер слушает `127.0.0.1:3001`; dev-фронтенд на `5173` проксирует `/api` на сервер.
- Ошибки API: JSON `{ "error": string, "message": string, "details"?: unknown }`; дубли имён → `409 duplicate`, пустые поля → `400 bad_request`, не найдено → `404 not_found`.
- Имена интентов и сущностей уникальны внутри проекта (UNIQUE `(project_id, name)`).
- Любое удаление в UI требует подтверждения в диалоге.
- Весь интерфейс на русском языке.
- Дизайн: минимализм, монохромная палитра, один акцентный цвет, шрифт Inter, без теней (фокус-кольца сохраняются).
- Экспорт: `GET /api/projects/:id/export?format=md|docx`; структура документа: титул, Сущности, Интенты, Сценарии.
- Вне объёма (не делать): правила классификации, токены и переменные, рассылки, аналитика, авторизация, тестирование NLU.
- Тесты: Vitest на сервер (роуты на SQLite `:memory:` + генераторы экспорта) и на чистые функции фронтенда; UI проверяется вручную по чек-листу в Task 10.
- Отклонения от спецификации (осознанные, мелкие): у `entity_values` есть колонка `position` (порядок значений); `scenario_steps.intent_id` — `ON DELETE SET NULL` (удаление интента не ломает сценарий, в экспорте показывается «—»).
- Папка проекта не является git-репозиторием. Task 1 выполняет `git init`; если пользователь против, шаги «Commit» пропускаются.

## Структура файлов

```
package.json                      корневые скрипты (dev/build/start/test), workspaces
.gitignore
README.md
server/
  package.json, tsconfig.json
  src/index.ts                    запуск: открыть БД, поднять app на 127.0.0.1:3001
  src/app.ts                      createApp(db, {webDist}) — сборка Express
  src/db.ts                       openDb(file) + SQL-схема
  src/errors.ts                   HttpError, notFound, badRequest, errorHandler
  src/validate.ts                 parseId, requireString, optString, cleanStrings
  src/routes/projects.ts          /api/projects
  src/routes/entities.ts          сущности + значения
  src/routes/intents.ts           интенты + слоты + фразы
  src/routes/scenarios.ts         сценарии + шаги
  src/routes/export.ts            /api/projects/:id/export
  src/export/model.ts             loadProjectSpec(db, id) → ProjectSpec
  src/export/tables.ts            общие заголовки и строки таблиц для MD и DOCX
  src/export/markdown.ts          renderMarkdown(spec, date)
  src/export/docx.ts              renderDocx(spec, date)
  test/helpers.ts, test/*.test.ts
web/
  src/main.tsx, App.tsx, index.css
  src/lib/api.ts, types.ts, parse.ts, parse.test.ts
  src/hooks/project.tsx, useAutosave.ts
  src/components/AppShell.tsx, ProjectSwitcher.tsx, ExportMenu.tsx, MasterDetail.tsx,
                 ConfirmDialog.tsx, CreateDialog.tsx, TagInput.tsx, SaveIndicator.tsx
  src/pages/entities/{EntitiesPage,EntityList,EntityForm}.tsx
  src/pages/intents/{IntentsPage,IntentList,IntentForm,SlotsTable,PhrasesPanel}.tsx
  src/pages/scenarios/{ScenariosPage,ScenarioList,ScenarioForm,StepsTable}.tsx
data/spec.db                      создаётся автоматически
```

---

### Task 1: Каркас сервера, схема БД, API проектов

**Files:**
- Create: `package.json`, `.gitignore`, `server/package.json` (через npm), `server/tsconfig.json`
- Create: `server/src/{db,errors,validate,app,index}.ts`, `server/src/routes/projects.ts`
- Create: `server/test/helpers.ts`, `server/test/projects.test.ts`

**Interfaces:**
- Produces:
  - `type Db = Database.Database`; `openDb(file: string): Db` (`':memory:'` допустим)
  - `class HttpError(status, code, message, details?)`, `notFound(what: string)`, `badRequest(message: string)`, `errorHandler`
  - `parseId(v: unknown): number`, `requireString(v: unknown, field: string): string`, `optString(v: unknown): string`, `cleanStrings(v: unknown): string[]`
  - `createApp(db: Db, opts?: { webDist?: string }): Express`
  - Роутеры экспортируются как `xxxRouter(db: Db): Router` и монтируются на `/api` (пути внутри роутера полные: `/projects/...`)
  - Тестовый хелпер `makeApp(): { app: Express; db: Db }`
  - API: `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id`

- [ ] **Step 1: Корневой package.json, .gitignore, git init**

`package.json`:
```json
{
  "name": "cui-spec-maker",
  "private": true,
  "type": "module",
  "workspaces": ["server"],
  "scripts": {
    "dev": "concurrently -n server,web -c gray,blue \"npm run dev -w server\" \"npm run dev -w web\"",
    "build": "npm run build -w web",
    "start": "npm run start -w server",
    "test": "npm run test -w server && npm run test -w web"
  }
}
```

`.gitignore`:
```
node_modules
data/*.db
data/*.db-*
web/dist
```

Run:
```bash
git init
npm install -D concurrently
```

- [ ] **Step 2: Пакет server**

Создать `server/package.json`:
```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Run:
```bash
npm install -w server express better-sqlite3 docx
npm install -w server -D typescript tsx vitest supertest jszip @types/node @types/express @types/better-sqlite3 @types/supertest
```
Expected: установка без ошибок. Если `better-sqlite3` не собирается под Node 24 на Windows (нет prebuilt-бинарника), остановиться и сообщить: запасной вариант — встроенный `node:sqlite`, API почти такой же.

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Тестовый хелпер и падающий тест**

`server/test/helpers.ts`:
```ts
import { openDb, type Db } from '../src/db';
import { createApp } from '../src/app';
import type { Express } from 'express';

export function makeApp(): { app: Express; db: Db } {
  const db = openDb(':memory:');
  return { db, app: createApp(db) };
}
```

`server/test/projects.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

describe('projects API', () => {
  it('creates, lists, renames and deletes a project', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/projects').send({ name: ' Вампус ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Вампус', description: '' });

    const list = await request(app).get('/api/projects');
    expect(list.body).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/projects/${created.body.id}`)
      .send({ name: 'Вампус 2', description: 'Игра' });
    expect(patched.body).toMatchObject({ name: 'Вампус 2', description: 'Игра' });

    const del = await request(app).delete(`/api/projects/${created.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get('/api/projects')).body).toHaveLength(0);
  });

  it('rejects an empty name with 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/projects').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
  });

  it('returns 404 for a missing project', async () => {
    const { app } = makeApp();
    const res = await request(app).patch('/api/projects/999').send({ name: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('cascades deletion to project content', async () => {
    const { app, db } = makeApp();
    const p = await request(app).post('/api/projects').send({ name: 'P' });
    db.prepare('INSERT INTO entities(project_id, name) VALUES (?, ?)').run(p.body.id, 'e');
    await request(app).delete(`/api/projects/${p.body.id}`);
    expect(db.prepare('SELECT COUNT(*) AS c FROM entities').get()).toEqual({ c: 0 });
  });

  it('returns 400 for malformed JSON', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/projects')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Запустить — убедиться, что падает**

Run: `npm test -w server`
Expected: FAIL — `Cannot find module '../src/db'`.

- [ ] **Step 5: Реализация**

`server/src/db.ts`:
```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS entity_values (
  id INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  synonyms TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS intents (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  comment TEXT NOT NULL DEFAULT '',
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS intent_slots (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  required INTEGER NOT NULL DEFAULT 0,
  is_array INTEGER NOT NULL DEFAULT 0,
  prompts TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS intent_phrases (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scenarios (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS scenario_steps (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  intent_id INTEGER REFERENCES intents(id) ON DELETE SET NULL,
  system_reply TEXT NOT NULL DEFAULT '',
  system_action TEXT NOT NULL DEFAULT ''
);
`;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}
```

`server/src/errors.ts`:
```ts
import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} не найден`);
export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_request', message: 'Некорректный JSON' });
    return;
  }
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    res.status(409).json({ error: 'duplicate', message: 'Элемент с таким названием уже существует' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Внутренняя ошибка сервера' });
};
```

`server/src/validate.ts`:
```ts
import { badRequest } from './errors';

export function parseId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Некорректный id');
  return n;
}

export function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw badRequest(`Поле «${field}» не может быть пустым`);
  return v.trim();
}

export const optString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function cleanStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}
```

`server/src/routes/projects.ts`:
```ts
import { Router } from 'express';
import type { Db } from '../db';
import { notFound } from '../errors';
import { optString, parseId, requireString } from '../validate';

export function projectsRouter(db: Db): Router {
  const r = Router();
  const get = (id: number) =>
    db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(id) as
      | { id: number; name: string; description: string }
      | undefined;

  r.get('/projects', (_req, res) => {
    res.json(db.prepare('SELECT id, name, description FROM projects ORDER BY name').all());
  });

  r.post('/projects', (req, res) => {
    const name = requireString(req.body?.name, 'Название');
    const description = optString(req.body?.description);
    const info = db.prepare('INSERT INTO projects(name, description) VALUES (?, ?)').run(name, description);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, description });
  });

  r.patch('/projects/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = get(id);
    if (!cur) throw notFound('Проект');
    const name = req.body?.name === undefined ? cur.name : requireString(req.body.name, 'Название');
    const description = req.body?.description === undefined ? cur.description : optString(req.body.description);
    db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(name, description, id);
    res.json({ id, name, description });
  });

  r.delete('/projects/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!get(id)) throw notFound('Проект');
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
```

`server/src/app.ts`:
```ts
import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { errorHandler } from './errors';
import { projectsRouter } from './routes/projects';

export function createApp(db: Db, opts: { webDist?: string } = {}): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', projectsRouter(db));

  const { webDist } = opts;
  if (webDist && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
```

`server/src/index.ts`:
```ts
import path from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

const root = path.resolve(import.meta.dirname, '../..');
const db = openDb(process.env.DB_FILE ?? path.join(root, 'data', 'spec.db'));
const app = createApp(db, { webDist: path.join(root, 'web', 'dist') });
const port = Number(process.env.PORT ?? 3001);

app.listen(port, '127.0.0.1', () => {
  console.log(`API: http://127.0.0.1:${port}`);
});
```

- [ ] **Step 6: Запустить тесты и typecheck**

Run: `npm test -w server; npm run typecheck -w server`
Expected: 5 tests PASS, typecheck без ошибок.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(server): scaffold, SQLite schema, projects API"
```

---

### Task 2: Каркас фронтенда: Vite, Tailwind, Shadcn, оболочка, переключатель проектов

**Files:**
- Create: `web/` (Vite react-ts), `web/vite.config.ts`, `web/src/index.css`, `web/src/main.tsx`, `web/src/App.tsx`
- Create: `web/src/lib/{types,api,parse}.ts`, `web/src/lib/parse.test.ts`
- Create: `web/src/hooks/{project.tsx,useAutosave.ts}`
- Create: `web/src/components/{AppShell,ProjectSwitcher,MasterDetail,ConfirmDialog,CreateDialog,TagInput,SaveIndicator}.tsx`
- Create: страницы-заглушки `web/src/pages/{entities,intents,scenarios}/*Page.tsx`

**Interfaces:**
- Consumes: API проектов из Task 1.
- Produces:
  - `api.projects.{list, create(name), remove(id)}`, `ApiError`
  - `useProject(): { projects, project: Project | null, setProjectId(id), isLoading }`, `useProjectId(): number`
  - `useAutosave<T>(value: T, save: (v: T) => Promise<unknown>, opts?: { delay?: number }): SaveState`
  - `parsePhrases(text): string[]`, `parseBulkValues(text): EntityValue[]`, `splitTags(text): string[]`, `groupIntents(items)`
  - Компоненты: `MasterDetail({ list, children })`, `ConfirmDialog`, `CreateDialog`, `TagInput({ value, onChange, placeholder?, commaSplit? })`, `SaveIndicator({ state })`

- [ ] **Step 1: Создать Vite-проект и подключить в workspaces**

Run (в корне):
```bash
npm create vite@latest web -- --template react-ts
```
Если спросит про «install and start now» — выбрать No. Затем:
- в корневом `package.json` заменить `"workspaces": ["server"]` на `["server", "web"]`;
- удалить `web/package-lock.json` и `web/node_modules`, если появились;
- в `web/package.json` добавить в `scripts`: `"test": "vitest run"`, `"typecheck": "tsc -b"`.

Run:
```bash
npm install
npm install -w web tailwindcss @tailwindcss/vite react-router-dom @tanstack/react-query sonner lucide-react @fontsource-variable/inter @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -w web -D vitest @types/node
```

- [ ] **Step 2: Vite-конфиг, алиас `@`, Tailwind**

`web/vite.config.ts`:
```ts
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3001' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

В `web/tsconfig.json` и `web/tsconfig.app.json` в `compilerOptions` добавить:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

`web/src/index.css` (заменить содержимое на `@import "tailwindcss";` — Shadcn init на следующем шаге допишет токены).

- [ ] **Step 3: Shadcn UI**

Run (в `web/`):
```bash
cd web
npx shadcn@latest init -d
npx shadcn@latest add button input textarea select switch checkbox table dialog alert-dialog dropdown-menu badge sonner separator
cd ..
```
Expected: появились `web/components.json`, `web/src/lib/utils.ts`, `web/src/components/ui/*`. Если init спросил базовый цвет — выбрать Neutral.

Дописать в конец `web/src/index.css` (минимализм: акцент + без теней, фокус-кольца не трогаем):
```css
:root {
  --brand: oklch(0.55 0.2 270);
}

@theme inline {
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --color-brand: var(--brand);
}

@layer base {
  * {
    --tw-shadow: 0 0 #0000 !important;
  }
  body {
    font-family: var(--font-sans);
  }
}
```

- [ ] **Step 4: Типы, API-клиент и чистые функции (TDD для parse)**

`web/src/lib/types.ts`:
```ts
export interface Project { id: number; name: string; description: string }

export interface EntityListItem { id: number; name: string; value_count: number }
export interface EntityValue { value: string; synonyms: string[] }
export interface Entity {
  id: number; project_id: number; name: string; description: string;
  values: EntityValue[]; used_by: { id: number; name: string }[];
}

export interface IntentListItem { id: number; name: string; group_name: string; enabled: boolean; phrase_count: number }
export interface Slot { key?: string; name: string; entity_id: number | null; required: boolean; is_array: boolean; prompts: string[] }
export interface Intent {
  id: number; project_id: number; name: string; path: string; group_name: string;
  enabled: boolean; comment: string; slots: Slot[]; phrases: string[];
}

export interface ScenarioListItem { id: number; name: string; step_count: number }
export interface Step { key?: string; intent_id: number | null; system_reply: string; system_action: string }
export interface Scenario { id: number; project_id: number; name: string; description: string; steps: Step[] }
```

`web/src/lib/parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { groupIntents, parseBulkValues, parsePhrases, splitTags } from './parse';

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

describe('groupIntents', () => {
  it('groups by group_name and puts ungrouped last', () => {
    const items = [
      { id: 1, group_name: '' },
      { id: 2, group_name: 'Б' },
      { id: 3, group_name: 'А' },
      { id: 4, group_name: 'Б' },
    ];
    expect(groupIntents(items).map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ['А', [3]],
      ['Б', [2, 4]],
      ['', [1]],
    ]);
  });
});
```

Run: `npm test -w web` → Expected: FAIL (`./parse` не найден).

`web/src/lib/parse.ts`:
```ts
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

export function groupIntents<T extends { group_name: string }>(items: T[]): { group: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const list = map.get(it.group_name) ?? [];
    list.push(it);
    map.set(it.group_name, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'ru')))
    .map(([group, items]) => ({ group, items }));
}
```

Run: `npm test -w web` → Expected: 4 tests PASS.

`web/src/lib/api.ts`:
```ts
import type { Project } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new ApiError(res.status, j.error ?? 'error', j.message ?? res.statusText, j.details);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  projects: {
    list: () => req<Project[]>('GET', '/api/projects'),
    create: (name: string) => req<Project>('POST', '/api/projects', { name }),
    remove: (id: number) => req<void>('DELETE', `/api/projects/${id}`),
  },
  exportUrl: (projectId: number, format: 'md' | 'docx') => `/api/projects/${projectId}/export?format=${format}`,
};
```

- [ ] **Step 5: Контекст проекта и автосохранение**

`web/src/hooks/project.tsx`:
```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Project } from '@/lib/types';

interface Ctx {
  projects: Project[];
  project: Project | null;
  setProjectId: (id: number) => void;
  isLoading: boolean;
}
const ProjectCtx = createContext<Ctx | null>(null);

const KEY = 'cui.projectId';
function readStored(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  const [id, setId] = useState<number | null>(readStored);
  const project = projects.find((p) => p.id === id) ?? projects[0] ?? null;
  const setProjectId = (n: number) => {
    setId(n);
    try {
      localStorage.setItem(KEY, String(n));
    } catch {
      /* хранилище недоступно — выбор живёт только до перезагрузки */
    }
  };
  return <ProjectCtx.Provider value={{ projects, project, setProjectId, isLoading }}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const c = useContext(ProjectCtx);
  if (!c) throw new Error('useProject вне ProjectProvider');
  return c;
}

export function useProjectId(): number {
  const { project } = useProject();
  if (!project) throw new Error('Проект не выбран');
  return project.id;
}
```

`web/src/hooks/useAutosave.ts`:
```ts
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Сохраняет `value` через `save` спустя `delay` мс после последнего изменения.
 *  Не сохраняет начальное значение. При размонтировании досохраняет ожидающее изменение. */
export function useAutosave<T>(value: T, save: (v: T) => Promise<unknown>, { delay = 700 } = {}): SaveState {
  const [state, setState] = useState<SaveState>('idle');
  const initial = useRef(value);
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<{ v: T } | null>(null);

  useEffect(() => {
    if (value === initial.current) return;
    pending.current = { v: value };
    setState('saving');
    const t = setTimeout(() => {
      pending.current = null;
      saveRef
        .current(value)
        .then(() => setState('saved'))
        .catch((e: Error) => {
          setState('error');
          toast.error(e.message);
        });
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  useEffect(
    () => () => {
      if (pending.current) void saveRef.current(pending.current.v).catch(() => {});
    },
    [],
  );

  return state;
}
```

- [ ] **Step 6: Общие компоненты**

`web/src/components/SaveIndicator.tsx`:
```tsx
import type { SaveState } from '@/hooks/useAutosave';

const LABEL: Record<SaveState, string> = { idle: '', saving: 'Сохранение…', saved: 'Сохранено', error: 'Ошибка сохранения' };

export function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span role="status" className="text-xs text-muted-foreground">
      {LABEL[state]}
    </span>
  );
}
```

`web/src/components/MasterDetail.tsx`:
```tsx
import type { ReactNode } from 'react';

export function MasterDetail({ list, children }: { list: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r">{list}</aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-6">{children}</section>
    </div>
  );
}

export function EmptyDetail({ text = 'Выберите элемент слева или создайте новый' }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
```

`web/src/components/ConfirmDialog.tsx`:
```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Удалить', onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

`web/src/components/CreateDialog.tsx`:
```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onCreate: (name: string, group: string) => void;
  withGroup?: boolean;
  groups?: string[];
}

export function CreateDialog({ open, onOpenChange, title, onCreate, withGroup, groups = [] }: Props) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), group.trim());
    setName('');
    setGroup('');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input autoFocus placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} />
          {withGroup && (
            <>
              <Input placeholder="Группа (необязательно)" list="group-options" value={group} onChange={(e) => setGroup(e.target.value)} />
              <datalist id="group-options">
                {groups.filter(Boolean).map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`web/src/components/TagInput.tsx`:
```tsx
import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { splitTags } from '@/lib/parse';

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** true — запятая завершает тег; false — только Enter/потеря фокуса (для вопросов с запятыми) */
  commaSplit?: boolean;
}

export function TagInput({ value, onChange, placeholder, commaSplit = true }: Props) {
  const [text, setText] = useState('');
  const commit = (raw: string) => {
    const add = commaSplit ? splitTags(raw) : raw.trim() ? [raw.trim()] : [];
    if (add.length) onChange([...value, ...add]);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-2 focus-within:ring-ring/50">
      {value.map((t, i) => (
        <Badge key={`${t}-${i}`} variant="secondary" className="gap-1 font-normal">
          {t}
          <button type="button" aria-label={`Удалить ${t}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          const t = e.target.value;
          if (commaSplit && t.includes(',')) commit(t);
          else setText(t);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(text)}
      />
    </div>
  );
}
```

- [ ] **Step 7: Переключатель проектов и оболочка**

`web/src/components/ProjectSwitcher.tsx`:
```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateDialog } from '@/components/CreateDialog';
import { useProject } from '@/hooks/project';
import { api } from '@/lib/api';

export function ProjectSwitcher() {
  const { projects, project, setProjectId } = useProject();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const create = useMutation({
    mutationFn: (name: string) => api.projects.create(name),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setProjectId(p.id);
      navigate('/');
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.projects.remove(id),
    onSuccess: () => {
      qc.invalidateQueries();
      navigate('/');
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            {project?.name ?? 'Нет проекта'}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => {
                setProjectId(p.id);
                navigate('/');
              }}
            >
              <Check className={p.id === project?.id ? 'size-4' : 'size-4 opacity-0'} />
              {p.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>Новый проект…</DropdownMenuItem>
          {project && (
            <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(true)}>
              Удалить проект
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateDialog open={creating} onOpenChange={setCreating} title="Новый проект" onCreate={(name) => create.mutate(name)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Удалить проект «${project?.name}»?`}
        description="Все интенты, сущности и сценарии проекта будут удалены безвозвратно."
        onConfirm={() => project && remove.mutate(project.id)}
      />
    </>
  );
}
```

`web/src/components/AppShell.tsx`:
```tsx
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CreateDialog } from '@/components/CreateDialog';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { useProject } from '@/hooks/project';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/intents', label: 'Интенты' },
  { to: '/entities', label: 'Сущности' },
  { to: '/scenarios', label: 'Сценарии' },
];

function NoProject() {
  const qc = useQueryClient();
  const { setProjectId } = useProject();
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (name: string) => api.projects.create(name),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setProjectId(p.id);
    },
  });
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <p className="text-sm text-muted-foreground">Проектов пока нет</p>
      <Button onClick={() => setOpen(true)}>Создать проект</Button>
      <CreateDialog open={open} onOpenChange={setOpen} title="Новый проект" onCreate={(n) => create.mutate(n)} />
    </div>
  );
}

export function AppShell() {
  const { project, isLoading } = useProject();
  if (isLoading) return null;
  if (!project) return <NoProject />;
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <ProjectSwitcher />
        <div id="header-actions" className="flex items-center gap-2" />
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 border-r p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground',
                  isActive && 'bg-muted font-medium text-brand',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```
(`#header-actions` — точка вставки; ExportMenu в Task 9 рендерится в шапку напрямую, этот div заменяется там.)

- [ ] **Step 8: Точка входа, роутинг, заглушки страниц**

`web/src/main.tsx` (заменить):
```tsx
import '@fontsource-variable/inter';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import App from './App';

const onError = (e: Error) => toast.error(e.message);
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

`web/src/App.tsx` (заменить):
```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ProjectProvider } from '@/hooks/project';
import { EntitiesPage } from '@/pages/entities/EntitiesPage';
import { IntentsPage } from '@/pages/intents/IntentsPage';
import { ScenariosPage } from '@/pages/scenarios/ScenariosPage';

export default function App() {
  return (
    <ProjectProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/intents" replace />} />
          <Route path="intents/:id?" element={<IntentsPage />} />
          <Route path="entities/:id?" element={<EntitiesPage />} />
          <Route path="scenarios/:id?" element={<ScenariosPage />} />
        </Route>
      </Routes>
    </ProjectProvider>
  );
}
```

Заглушки (по одной на раздел, заменяются в Tasks 4/6/8), например `web/src/pages/intents/IntentsPage.tsx`:
```tsx
export function IntentsPage() {
  return <p className="p-6 text-sm text-muted-foreground">Интенты — скоро</p>;
}
```
Аналогично `EntitiesPage` («Сущности — скоро») и `ScenariosPage` («Сценарии — скоро»).

Удалить шаблонные `web/src/App.css` и ассеты Vite, если не нужны.

- [ ] **Step 9: Проверка**

Run: `npm run typecheck -w web; npm test -w web; npm run dev`
Expected: typecheck чистый, 4 теста PASS. В браузере `http://localhost:5173`: «Проектов пока нет» → создать проект «Тест» → видна шапка с переключателем, сайдбар с тремя разделами, в каждом заглушка. Остановить dev-сервер.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): scaffold, shell, project switcher, shared components"
```

---

### Task 3: API сущностей

**Files:**
- Create: `server/src/routes/entities.ts`, `server/test/entities.test.ts`
- Modify: `server/src/app.ts` (подключить роутер)

**Interfaces:**
- Consumes: `Db`, `parseId`, `requireString`, `optString`, `cleanStrings`, `notFound`, `HttpError`, `makeApp` (Task 1).
- Produces (REST):
  - `GET /api/projects/:pid/entities` → `{ id, name, value_count }[]`
  - `POST /api/projects/:pid/entities` `{ name }` → `201 { id, name }`
  - `GET /api/entities/:id` → `{ id, project_id, name, description, values: { value, synonyms: string[] }[], used_by: { id, name }[] }`
  - `PUT /api/entities/:id` `{ name, description, values }` → тот же объект, что GET
  - `DELETE /api/entities/:id[?force=1]` → `204`; если сущность используется в слотах и нет `force=1` → `409 { error: 'in_use', details: { intents: { id, name }[] } }`; с `force=1` слоты теряют сущность (`entity_id = NULL`).

- [ ] **Step 1: Падающий тест**

`server/test/entities.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

async function setup() {
  const { app, db } = makeApp();
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  return { app, db, pid: p.body.id as number };
}

describe('entities API', () => {
  it('creates and lists entities with value counts', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'compliment' });
    expect(c.status).toBe(201);
    const list = await request(app).get(`/api/projects/${pid}/entities`);
    expect(list.body).toEqual([{ id: c.body.id, name: 'compliment', value_count: 0 }]);
  });

  it('rejects duplicate names with 409', async () => {
    const { app, pid } = await setup();
    await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'a' });
    const dup = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'a' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('duplicate');
  });

  it('PUT replaces values, trims synonyms and drops empty values', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'compliment' });
    const put = await request(app)
      .put(`/api/entities/${c.body.id}`)
      .send({
        name: 'compliment',
        description: 'Похвала',
        values: [
          { value: ' красавчик ', synonyms: [' молодец ', '', 'умница'] },
          { value: '  ', synonyms: ['x'] },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.description).toBe('Похвала');
    expect(put.body.values).toEqual([{ value: 'красавчик', synonyms: ['молодец', 'умница'] }]);
    const get = await request(app).get(`/api/entities/${c.body.id}`);
    expect(get.body.values).toHaveLength(1);
    expect(get.body.used_by).toEqual([]);
  });

  it('refuses to delete a used entity without force and clears slots with force', async () => {
    const { app, db, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'compliment' });
    const intent = db.prepare('INSERT INTO intents(project_id, name) VALUES (?, ?)').run(pid, 'Вернуться');
    db.prepare('INSERT INTO intent_slots(intent_id, name, entity_id) VALUES (?, ?, ?)').run(
      intent.lastInsertRowid, 'comp', c.body.id,
    );

    const refused = await request(app).delete(`/api/entities/${c.body.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('in_use');
    expect(refused.body.details.intents).toEqual([{ id: Number(intent.lastInsertRowid), name: 'Вернуться' }]);

    const forced = await request(app).delete(`/api/entities/${c.body.id}?force=1`);
    expect(forced.status).toBe(204);
    expect(db.prepare('SELECT entity_id FROM intent_slots').get()).toEqual({ entity_id: null });
  });

  it('returns 404 for a missing entity', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/entities/999')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -w server -- entities`
Expected: FAIL (404 на `/api/projects/:pid/entities`).

- [ ] **Step 3: Реализация**

`server/src/routes/entities.ts`:
```ts
import { Router } from 'express';
import type { Db } from '../db';
import { HttpError, notFound } from '../errors';
import { cleanStrings, optString, parseId, requireString } from '../validate';

interface ValueIn { value: string; synonyms: string[] }

function cleanValues(raw: unknown): ValueIn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => ({
      value: typeof v?.value === 'string' ? v.value.trim() : '',
      synonyms: cleanStrings(v?.synonyms),
    }))
    .filter((v) => v.value);
}

export function entitiesRouter(db: Db): Router {
  const r = Router();

  const usedBy = (id: number) =>
    db
      .prepare(
        `SELECT DISTINCT i.id, i.name FROM intent_slots s
         JOIN intents i ON i.id = s.intent_id WHERE s.entity_id = ? ORDER BY i.name`,
      )
      .all(id) as { id: number; name: string }[];

  const load = (id: number) => {
    const e = db.prepare('SELECT id, project_id, name, description FROM entities WHERE id = ?').get(id) as
      | { id: number; project_id: number; name: string; description: string }
      | undefined;
    if (!e) throw notFound('Сущность');
    const values = (
      db.prepare('SELECT value, synonyms FROM entity_values WHERE entity_id = ? ORDER BY position, id').all(id) as {
        value: string;
        synonyms: string;
      }[]
    ).map((v) => ({ value: v.value, synonyms: JSON.parse(v.synonyms) as string[] }));
    return { ...e, values, used_by: usedBy(id) };
  };

  r.get('/projects/:pid/entities', (req, res) => {
    const pid = parseId(req.params.pid);
    res.json(
      db
        .prepare(
          `SELECT e.id, e.name,
                  (SELECT COUNT(*) FROM entity_values v WHERE v.entity_id = e.id) AS value_count
           FROM entities e WHERE e.project_id = ? ORDER BY e.name`,
        )
        .all(pid),
    );
  });

  r.post('/projects/:pid/entities', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = requireString(req.body?.name, 'Название');
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const info = db.prepare('INSERT INTO entities(project_id, name) VALUES (?, ?)').run(pid, name);
    res.status(201).json({ id: Number(info.lastInsertRowid), name });
  });

  r.get('/entities/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/entities/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    const name = requireString(req.body?.name, 'Название');
    const description = optString(req.body?.description);
    const values = cleanValues(req.body?.values);
    db.transaction(() => {
      db.prepare('UPDATE entities SET name = ?, description = ? WHERE id = ?').run(name, description, id);
      db.prepare('DELETE FROM entity_values WHERE entity_id = ?').run(id);
      const ins = db.prepare('INSERT INTO entity_values(entity_id, value, synonyms, position) VALUES (?, ?, ?, ?)');
      values.forEach((v, i) => ins.run(id, v.value, JSON.stringify(v.synonyms), i));
    })();
    res.json(load(id));
  });

  r.delete('/entities/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    const intents = usedBy(id);
    if (intents.length && req.query.force !== '1') {
      throw new HttpError(409, 'in_use', 'Сущность используется в слотах интентов', { intents });
    }
    db.prepare('DELETE FROM entities WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
```

В `server/src/app.ts` добавить импорт `import { entitiesRouter } from './routes/entities';` и строку `app.use('/api', entitiesRouter(db));` после `projectsRouter`.

- [ ] **Step 4: Запустить тесты**

Run: `npm test -w server; npm run typecheck -w server`
Expected: все тесты PASS (10), typecheck чистый.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): entities API"
```

---

### Task 4: UI раздела «Сущности»

**Files:**
- Modify: `web/src/lib/api.ts` (добавить `api.entities`)
- Create: `web/src/pages/entities/{EntityList,EntityForm}.tsx`
- Modify: `web/src/pages/entities/EntitiesPage.tsx` (заменить заглушку)

**Interfaces:**
- Consumes: `/api/entities` (Task 3), `MasterDetail`, `EmptyDetail`, `CreateDialog`, `ConfirmDialog`, `TagInput`, `SaveIndicator`, `useAutosave`, `useProjectId`, `parseBulkValues`, типы `Entity`, `EntityListItem`, `EntityValue`.
- Produces: `api.entities.{list(pid), get(id), create(pid, name), save(id, body), remove(id, force?)}`; query-ключи `['entities', projectId]` (список) и `['entity', id]` (карточка) — на них опирается `SlotsTable` в Task 6.

- [ ] **Step 1: Расширить API-клиент**

В `web/src/lib/api.ts` добавить импорт типов `Entity, EntityListItem, EntityValue` и в объект `api` секцию:
```ts
  entities: {
    list: (pid: number) => req<EntityListItem[]>('GET', `/api/projects/${pid}/entities`),
    get: (id: number) => req<Entity>('GET', `/api/entities/${id}`),
    create: (pid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/projects/${pid}/entities`, { name }),
    save: (id: number, body: { name: string; description: string; values: EntityValue[] }) =>
      req<Entity>('PUT', `/api/entities/${id}`, body),
    remove: (id: number, force = false) => req<void>('DELETE', `/api/entities/${id}${force ? '?force=1' : ''}`),
  },
```

- [ ] **Step 2: Список сущностей**

`web/src/pages/entities/EntityList.tsx`:
```tsx
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateDialog } from '@/components/CreateDialog';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function EntityList() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: items = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });
  const create = useMutation({
    mutationFn: (name: string) => api.entities.create(projectId, name),
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ['entities', projectId] });
      navigate(`/entities/${e.id}`);
    },
  });

  return (
    <>
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-sm font-medium">Сущности</span>
        <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Создать
        </Button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {items.map((e) => (
          <li key={e.id}>
            <NavLink
              to={`/entities/${e.id}`}
              className={({ isActive }) =>
                cn('flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-muted', isActive && 'bg-muted font-medium')
              }
            >
              <span>@{e.name}</span>
              <span className="text-xs text-muted-foreground">{e.value_count}</span>
            </NavLink>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Сущностей пока нет</li>}
      </ul>
      <CreateDialog open={creating} onOpenChange={setCreating} title="Новая сущность" onCreate={(n) => create.mutate(n)} />
    </>
  );
}
```

- [ ] **Step 3: Форма сущности**

`web/src/pages/entities/EntityForm.tsx`:
```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { TagInput } from '@/components/TagInput';
import { useAutosave } from '@/hooks/useAutosave';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { parseBulkValues } from '@/lib/parse';
import type { Entity } from '@/lib/types';

type Draft = Pick<Entity, 'name' | 'description' | 'values'>;

export function EntityForm({ entity }: { entity: Entity }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>({ name: entity.name, description: entity.description, values: entity.values });
  const [bulk, setBulk] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.entities.save(entity.id, d);
    qc.invalidateQueries({ queryKey: ['entities', projectId] });
  });

  const remove = useMutation({
    mutationFn: () => api.entities.remove(entity.id, entity.used_by.length > 0),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities', projectId] });
      qc.invalidateQueries({ queryKey: ['intents', projectId] });
      navigate('/entities');
    },
  });

  const setValues = (values: Draft['values']) => setDraft((d) => ({ ...d, values }));
  const patchValue = (i: number, p: Partial<Draft['values'][number]>) =>
    setValues(draft.values.map((v, j) => (j === i ? { ...v, ...p } : v)));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-1">
            <span className="text-lg text-muted-foreground">@</span>
            <Input
              className="text-lg font-medium"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              aria-label="Название сущности"
            />
          </div>
          <Textarea
            rows={2}
            placeholder="Описание"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <SaveIndicator state={status} />
          <Button variant="ghost" size="icon" aria-label="Удалить сущность" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Значения</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulk('')}>Массовая вставка</Button>
            <Button size="sm" variant="outline" onClick={() => setValues([...draft.values, { value: '', synonyms: [] }])}>
              Добавить значение
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">Значение</TableHead>
              <TableHead>Синонимы</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.values.map((v, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Input value={v.value} onChange={(e) => patchValue(i, { value: e.target.value })} />
                </TableCell>
                <TableCell>
                  <TagInput value={v.synonyms} onChange={(synonyms) => patchValue(i, { synonyms })} placeholder="Синоним, Enter" />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" aria-label="Удалить значение" onClick={() => setValues(draft.values.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {draft.values.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-sm text-muted-foreground">Значений пока нет</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Используется в интентах</h2>
        {entity.used_by.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нигде не используется</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {entity.used_by.map((i) => (
              <li key={i.id}>
                <Link className="text-sm text-brand hover:underline" to={`/intents/${i.id}`}>{i.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={bulk !== null} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Массовая вставка значений</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Одна строка — одно значение: <code>значение: синоним1, синоним2</code></p>
          <Textarea rows={8} value={bulk ?? ''} onChange={(e) => setBulk(e.target.value)} />
          <DialogFooter>
            <Button
              onClick={() => {
                setValues([...draft.values, ...parseBulkValues(bulk ?? '')]);
                setBulk(null);
              }}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Удалить сущность @${entity.name}?`}
        description={
          entity.used_by.length
            ? `Сущность используется в интентах: ${entity.used_by.map((i) => i.name).join(', ')}. В их слотах сущность будет сброшена.`
            : undefined
        }
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
```

- [ ] **Step 4: Страница**

`web/src/pages/entities/EntitiesPage.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyDetail, MasterDetail } from '@/components/MasterDetail';
import { api } from '@/lib/api';
import { EntityForm } from './EntityForm';
import { EntityList } from './EntityList';

function EntityEditor({ id }: { id: number }) {
  // gcTime: 0 — форма инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['entity', id], queryFn: () => api.entities.get(id), gcTime: 0 });
  if (!data) return null;
  return <EntityForm key={id} entity={data} />;
}

export function EntitiesPage() {
  const { id } = useParams();
  return (
    <MasterDetail list={<EntityList />}>
      {id ? <EntityEditor id={Number(id)} /> : <EmptyDetail />}
    </MasterDetail>
  );
}
```

- [ ] **Step 5: Проверка**

Run: `npm run typecheck -w web; npm run dev`
Ручная проверка (сервер и фронт запущены): создать сущность `compliment`; добавить значение «красавчик» с синонимами (Enter и запятая); «Массовая вставка» с `молодец: умница, супер`; перезагрузить страницу — данные на месте, индикатор показывал «Сохранено»; удаление запрашивает подтверждение. Остановить dev.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): entities section"
```

---

### Task 5: API интентов

**Files:**
- Create: `server/src/routes/intents.ts`, `server/test/intents.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: хелперы Task 1, таблицы `intent_slots`, `intent_phrases`, `scenario_steps`.
- Produces (REST):
  - `GET /api/projects/:pid/intents` → `{ id, name, group_name, enabled: boolean, phrase_count }[]` (сортировка по `group_name`, `name`)
  - `POST /api/projects/:pid/intents` `{ name, group_name? }` → `201 { id, name }` (`path` по умолчанию `/<name>`)
  - `GET /api/intents/:id` → `{ id, project_id, name, path, group_name, enabled: boolean, comment, slots: { name, entity_id: number|null, required: boolean, is_array: boolean, prompts: string[] }[], phrases: string[] }`
  - `PUT /api/intents/:id` — полная замена: тело `{ name, path, group_name, enabled, comment, slots, phrases }` (лишние поля вроде `key` игнорируются), ответ как у GET. Слот без имени → 400; `entity_id` чужого проекта → 400; пустые фразы отбрасываются.
  - `DELETE /api/intents/:id` → `204` (шаги сценариев теряют ссылку: `intent_id = NULL`).

- [ ] **Step 1: Падающий тест**

`server/test/intents.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

async function setup() {
  const { app, db } = makeApp();
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  const pid = p.body.id as number;
  const e = await request(app).post(`/api/projects/${pid}/entities`).send({ name: 'compliment' });
  return { app, db, pid, entityId: e.body.id as number };
}

describe('intents API', () => {
  it('creates an intent with default path and lists it with phrase count', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'Вернуться', group_name: 'Меню' });
    expect(c.status).toBe(201);
    const get = await request(app).get(`/api/intents/${c.body.id}`);
    expect(get.body).toMatchObject({ name: 'Вернуться', path: '/Вернуться', group_name: 'Меню', enabled: true, slots: [], phrases: [] });
    const list = await request(app).get(`/api/projects/${pid}/intents`);
    expect(list.body).toEqual([{ id: c.body.id, name: 'Вернуться', group_name: 'Меню', enabled: true, phrase_count: 0 }]);
  });

  it('PUT replaces slots and phrases', async () => {
    const { app, pid, entityId } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'Вернуться' });
    const body = {
      name: 'Вернуться', path: '/Вернуться', group_name: '', enabled: false, comment: 'коммент',
      slots: [
        { key: 'x', name: 'comp', entity_id: entityId, required: true, is_array: false, prompts: [' Какой? ', ''] },
        { name: 'free', entity_id: null, required: false, is_array: true, prompts: [] },
      ],
      phrases: ['* (вернуться/вернись) в игру* *', '  ', 'назад'],
    };
    const put = await request(app).put(`/api/intents/${c.body.id}`).send(body);
    expect(put.status).toBe(200);
    expect(put.body.enabled).toBe(false);
    expect(put.body.slots).toEqual([
      { name: 'comp', entity_id: entityId, required: true, is_array: false, prompts: ['Какой?'] },
      { name: 'free', entity_id: null, required: false, is_array: true, prompts: [] },
    ]);
    expect(put.body.phrases).toEqual(['* (вернуться/вернись) в игру* *', 'назад']);

    const again = await request(app).put(`/api/intents/${c.body.id}`).send({ ...body, slots: [], phrases: ['одна'] });
    expect(again.body.slots).toEqual([]);
    expect(again.body.phrases).toEqual(['одна']);
  });

  it('rejects a slot without a name and a foreign entity', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    const base = { name: 'A', path: '', group_name: '', enabled: true, comment: '', phrases: [] };
    const noName = await request(app)
      .put(`/api/intents/${c.body.id}`)
      .send({ ...base, slots: [{ name: ' ', entity_id: null, required: false, is_array: false, prompts: [] }] });
    expect(noName.status).toBe(400);
    const foreign = await request(app)
      .put(`/api/intents/${c.body.id}`)
      .send({ ...base, slots: [{ name: 's', entity_id: 9999, required: false, is_array: false, prompts: [] }] });
    expect(foreign.status).toBe(400);
  });

  it('rejects duplicate intent names with 409', async () => {
    const { app, pid } = await setup();
    await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    const dup = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    expect(dup.status).toBe(409);
  });

  it('deleting an intent keeps scenario steps but clears their intent', async () => {
    const { app, db, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'A' });
    const sc = db.prepare('INSERT INTO scenarios(project_id, name) VALUES (?, ?)').run(pid, 'S');
    db.prepare('INSERT INTO scenario_steps(scenario_id, intent_id) VALUES (?, ?)').run(sc.lastInsertRowid, c.body.id);
    const del = await request(app).delete(`/api/intents/${c.body.id}`);
    expect(del.status).toBe(204);
    expect(db.prepare('SELECT intent_id FROM scenario_steps').get()).toEqual({ intent_id: null });
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -w server -- intents`
Expected: FAIL (404 на маршрутах интентов).

- [ ] **Step 3: Реализация**

`server/src/routes/intents.ts`:
```ts
import { Router } from 'express';
import type { Db } from '../db';
import { badRequest, notFound } from '../errors';
import { cleanStrings, optString, parseId, requireString } from '../validate';

interface IntentRow {
  id: number; project_id: number; name: string; path: string;
  group_name: string; enabled: number; comment: string;
}

export function intentsRouter(db: Db): Router {
  const r = Router();

  const load = (id: number) => {
    const row = db
      .prepare('SELECT id, project_id, name, path, group_name, enabled, comment FROM intents WHERE id = ?')
      .get(id) as IntentRow | undefined;
    if (!row) throw notFound('Интент');
    const slots = (
      db
        .prepare('SELECT name, entity_id, required, is_array, prompts FROM intent_slots WHERE intent_id = ? ORDER BY position, id')
        .all(id) as { name: string; entity_id: number | null; required: number; is_array: number; prompts: string }[]
    ).map((s) => ({
      name: s.name,
      entity_id: s.entity_id,
      required: !!s.required,
      is_array: !!s.is_array,
      prompts: JSON.parse(s.prompts) as string[],
    }));
    const phrases = (
      db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(id) as { text: string }[]
    ).map((p) => p.text);
    return { ...row, enabled: !!row.enabled, slots, phrases };
  };

  r.get('/projects/:pid/intents', (req, res) => {
    const pid = parseId(req.params.pid);
    const rows = db
      .prepare(
        `SELECT i.id, i.name, i.group_name, i.enabled,
                (SELECT COUNT(*) FROM intent_phrases p WHERE p.intent_id = i.id) AS phrase_count
         FROM intents i WHERE i.project_id = ? ORDER BY i.group_name, i.name`,
      )
      .all(pid) as { id: number; name: string; group_name: string; enabled: number; phrase_count: number }[];
    res.json(rows.map((x) => ({ ...x, enabled: !!x.enabled })));
  });

  r.post('/projects/:pid/intents', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = requireString(req.body?.name, 'Название');
    const group = optString(req.body?.group_name).trim();
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const info = db
      .prepare('INSERT INTO intents(project_id, name, path, group_name) VALUES (?, ?, ?, ?)')
      .run(pid, name, `/${name}`, group);
    res.status(201).json({ id: Number(info.lastInsertRowid), name });
  });

  r.get('/intents/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/intents/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const b = (req.body ?? {}) as Record<string, any>;
    const name = requireString(b.name, 'Название');
    const slots = (Array.isArray(b.slots) ? b.slots : []).map((s: any) => ({
      name: requireString(s?.name, 'Название слота'),
      entity_id: s?.entity_id == null ? null : parseId(s.entity_id),
      required: !!s?.required,
      is_array: !!s?.is_array,
      prompts: cleanStrings(s?.prompts),
    }));
    const findEntity = db.prepare('SELECT 1 FROM entities WHERE id = ? AND project_id = ?');
    for (const s of slots) {
      if (s.entity_id !== null && !findEntity.get(s.entity_id, cur.project_id)) {
        throw badRequest('Сущность слота не найдена в проекте');
      }
    }
    const phrases = cleanStrings(b.phrases);

    db.transaction(() => {
      db.prepare('UPDATE intents SET name = ?, path = ?, group_name = ?, enabled = ?, comment = ? WHERE id = ?').run(
        name, optString(b.path), optString(b.group_name).trim(), b.enabled === false ? 0 : 1, optString(b.comment), id,
      );
      db.prepare('DELETE FROM intent_slots WHERE intent_id = ?').run(id);
      const insSlot = db.prepare(
        'INSERT INTO intent_slots(intent_id, name, entity_id, required, is_array, prompts, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      slots.forEach((s: any, i: number) =>
        insSlot.run(id, s.name, s.entity_id, s.required ? 1 : 0, s.is_array ? 1 : 0, JSON.stringify(s.prompts), i),
      );
      db.prepare('DELETE FROM intent_phrases WHERE intent_id = ?').run(id);
      const insPhrase = db.prepare('INSERT INTO intent_phrases(intent_id, text, position) VALUES (?, ?, ?)');
      phrases.forEach((t, i) => insPhrase.run(id, t, i));
    })();
    res.json(load(id));
  });

  r.delete('/intents/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM intents WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
```

В `server/src/app.ts`: `import { intentsRouter } from './routes/intents';` и `app.use('/api', intentsRouter(db));`.

- [ ] **Step 4: Запустить тесты**

Run: `npm test -w server; npm run typecheck -w server`
Expected: все тесты PASS (15), typecheck чистый.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): intents API"
```

---

### Task 6: UI раздела «Интенты»

**Files:**
- Modify: `web/src/lib/api.ts` (добавить `api.intents`)
- Create: `web/src/pages/intents/{IntentList,IntentForm,SlotsTable,PhrasesPanel}.tsx`
- Modify: `web/src/pages/intents/IntentsPage.tsx`

**Interfaces:**
- Consumes: `/api/intents` (Task 5), `api.entities.list` и ключ `['entities', projectId]` (Task 4), общие компоненты и `groupIntents`, `parsePhrases` (Task 2), типы `Intent`, `IntentListItem`, `Slot`.
- Produces: `api.intents.{list(pid), get(id), create(pid, name, group), save(id, body), remove(id)}`; query-ключи `['intents', projectId]` (список — на него опирается `StepsTable` в Task 8) и `['intent', id]`.

- [ ] **Step 1: Расширить API-клиент**

В `web/src/lib/api.ts` добавить импорт `Intent, IntentListItem` и секцию:
```ts
  intents: {
    list: (pid: number) => req<IntentListItem[]>('GET', `/api/projects/${pid}/intents`),
    get: (id: number) => req<Intent>('GET', `/api/intents/${id}`),
    create: (pid: number, name: string, group_name: string) =>
      req<{ id: number; name: string }>('POST', `/api/projects/${pid}/intents`, { name, group_name }),
    save: (id: number, body: Omit<Intent, 'id' | 'project_id'>) => req<Intent>('PUT', `/api/intents/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/intents/${id}`),
  },
```

- [ ] **Step 2: Список интентов (поиск, группы, счётчик)**

`web/src/pages/intents/IntentList.tsx`:
```tsx
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateDialog } from '@/components/CreateDialog';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { groupIntents } from '@/lib/parse';
import { cn } from '@/lib/utils';

export function IntentList() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data: items = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });

  const create = useMutation({
    mutationFn: ({ name, group }: { name: string; group: string }) => api.intents.create(projectId, name, group),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['intents', projectId] });
      navigate(`/intents/${i.id}`);
    },
  });

  const filtered = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const groups = groupIntents(filtered);
  const toggle = (g: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(g) ? n.delete(g) : n.add(g);
      return n;
    });

  return (
    <>
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-sm font-medium">Интенты <span className="text-muted-foreground">{items.length}</span></span>
        <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Создать
        </Button>
      </div>
      <div className="p-2">
        <Input placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map(({ group, items }) => {
          const isOpen = !collapsed.has(group);
          return (
            <div key={group || '__none'}>
              <button
                type="button"
                className="flex w-full items-center gap-1 px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                onClick={() => toggle(group)}
              >
                {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                {group || 'Без группы'}
              </button>
              {isOpen &&
                items.map((i) => (
                  <NavLink
                    key={i.id}
                    to={`/intents/${i.id}`}
                    className={({ isActive }) =>
                      cn('flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-muted', isActive && 'bg-muted font-medium', !i.enabled && 'opacity-50')
                    }
                  >
                    <span className="truncate">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{i.phrase_count}</span>
                  </NavLink>
                ))}
            </div>
          );
        })}
        {items.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Интентов пока нет</p>}
      </div>
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title="Новый интент"
        withGroup
        groups={[...new Set(items.map((i) => i.group_name))]}
        onCreate={(name, group) => create.mutate({ name, group })}
      />
    </>
  );
}
```

- [ ] **Step 3: Панель тренировочных фраз**

`web/src/pages/intents/PhrasesPanel.tsx`:
```tsx
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { parsePhrases } from '@/lib/parse';

interface Props {
  phrases: string[];
  onChange: (phrases: string[]) => void;
}

export function PhrasesPanel({ phrases, onChange }: Props) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const add = (raw: string) => {
    const items = parsePhrases(raw);
    if (items.length) onChange([...phrases, ...items]);
    setText('');
  };
  const visible = phrases
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.toLowerCase().includes(query.toLowerCase()));
  const allSelected = visible.length > 0 && visible.every(({ index }) => selected.has(index));

  const toggle = (index: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(index) ? n.delete(index) : n.add(index);
      return n;
    });
  const removeWhere = (pred: (i: number) => boolean) => {
    onChange(phrases.filter((_, i) => !pred(i)));
    setSelected(new Set());
  };

  return (
    <section className="space-y-3">
      <h2 className="font-medium">
        Тренировочные фразы <span className="text-muted-foreground">{phrases.length}</span>
      </h2>
      <Input
        placeholder="Фраза или паттерн, например: * (вернуться/вернись) в игру* *   — Enter, чтобы добавить"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (/\r?\n/.test(pasted)) {
            e.preventDefault();
            add(pasted);
          }
        }}
      />
      <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
        <Checkbox
          aria-label="Выбрать все"
          checked={allSelected}
          onCheckedChange={(c) =>
            setSelected(c ? new Set(visible.map(({ index }) => index)) : new Set())
          }
        />
        <span className="text-sm">Выбрано: {selected.size}</span>
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeWhere((i) => selected.has(i))}>
            Удалить выбранные
          </Button>
        )}
        <Input className="ml-auto h-8 w-56" placeholder="Поиск по фразам" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="divide-y">
        {visible.map(({ p, index }) => (
          <li key={index} className="flex items-center gap-3 px-3 py-2">
            <Checkbox aria-label="Выбрать фразу" checked={selected.has(index)} onCheckedChange={() => toggle(index)} />
            <span className="flex-1 break-all font-mono text-sm">{p}</span>
            <Button variant="ghost" size="icon" aria-label="Удалить фразу" onClick={() => removeWhere((i) => i === index)}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
        {phrases.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Фраз пока нет</li>}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Таблица слотов**

`web/src/pages/intents/SlotsTable.tsx`:
```tsx
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TagInput } from '@/components/TagInput';
import type { EntityListItem, Slot } from '@/lib/types';

interface Props {
  slots: Slot[];
  entities: EntityListItem[];
  onChange: (slots: Slot[]) => void;
}

export function SlotsTable({ slots, entities, onChange }: Props) {
  const patch = (i: number, p: Partial<Slot>) => onChange(slots.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const add = () =>
    onChange([
      ...slots,
      { key: crypto.randomUUID(), name: '', entity_id: null, required: false, is_array: false, prompts: [] },
    ]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Слоты</h2>
        <Button size="sm" variant="outline" onClick={add}>Добавить слот</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Название</TableHead>
            <TableHead className="w-52">Сущность</TableHead>
            <TableHead className="w-28">Обязательно</TableHead>
            <TableHead className="w-24">Массив</TableHead>
            <TableHead>Вопросы</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {slots.map((s, i) => (
            <TableRow key={s.key ?? i}>
              <TableCell>
                <Input placeholder="Название" value={s.name} onChange={(e) => patch(i, { name: e.target.value })} />
              </TableCell>
              <TableCell>
                <Select
                  value={s.entity_id === null ? 'none' : String(s.entity_id)}
                  onValueChange={(v) => patch(i, { entity_id: v === 'none' ? null : Number(v) })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— без сущности —</SelectItem>
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>@{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch checked={s.required} onCheckedChange={(c) => patch(i, { required: c })} aria-label="Обязательно" />
                  <span className="text-sm">{s.required ? 'Да' : 'Нет'}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch checked={s.is_array} onCheckedChange={(c) => patch(i, { is_array: c })} aria-label="Массив" />
                  <span className="text-sm">{s.is_array ? 'Да' : 'Нет'}</span>
                </div>
              </TableCell>
              <TableCell>
                <TagInput commaSplit={false} value={s.prompts} onChange={(prompts) => patch(i, { prompts })} placeholder="Введите вопрос" />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" aria-label="Удалить слот" onClick={() => onChange(slots.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {slots.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-sm text-muted-foreground">Слотов пока нет</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
```

- [ ] **Step 5: Форма интента и страница**

`web/src/pages/intents/IntentForm.tsx`:
```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import type { Intent } from '@/lib/types';
import { PhrasesPanel } from './PhrasesPanel';
import { SlotsTable } from './SlotsTable';

const withKeys = (i: Intent): Intent => ({ ...i, slots: i.slots.map((s) => ({ ...s, key: crypto.randomUUID() })) });

/** Слоты без названия остаются только на клиенте, пока пользователь не введёт имя. */
const toPayload = ({ id: _id, project_id: _pid, ...rest }: Intent) => ({
  ...rest,
  slots: rest.slots.filter((s) => s.name.trim()),
});

export function IntentForm({ intent }: { intent: Intent }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Intent>(() => withKeys(intent));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });

  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.intents.save(intent.id, toPayload(d));
    qc.invalidateQueries({ queryKey: ['intents', projectId] });
    qc.invalidateQueries({ queryKey: ['entities'] });
  });

  const remove = useMutation({
    mutationFn: () => api.intents.remove(intent.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intents', projectId] });
      navigate('/intents');
    },
  });

  const patch = (p: Partial<Intent>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Input className="text-lg font-medium" value={draft.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Название интента" />
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
            Интент {draft.enabled ? 'Вкл' : 'Выкл'}
          </label>
          <SaveIndicator state={status} />
          <Button variant="ghost" size="icon" aria-label="Удалить интент" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Input className="h-8 w-64 text-sm text-muted-foreground" placeholder="/путь" value={draft.path} onChange={(e) => patch({ path: e.target.value })} aria-label="Путь" />
          <Input className="h-8 w-64 text-sm" placeholder="Группа" value={draft.group_name} onChange={(e) => patch({ group_name: e.target.value })} aria-label="Группа" />
        </div>
        <Textarea rows={2} placeholder="Комментарий" value={draft.comment} onChange={(e) => patch({ comment: e.target.value })} />
      </div>

      <SlotsTable slots={draft.slots} entities={entities} onChange={(slots) => patch({ slots })} />
      <PhrasesPanel phrases={draft.phrases} onChange={(phrases) => patch({ phrases })} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Удалить интент «${intent.name}»?`}
        description="Шаги сценариев, использующие этот интент, останутся без интента."
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
```

`web/src/pages/intents/IntentsPage.tsx` (заменить):
```tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyDetail, MasterDetail } from '@/components/MasterDetail';
import { api } from '@/lib/api';
import { IntentForm } from './IntentForm';
import { IntentList } from './IntentList';

function IntentEditor({ id }: { id: number }) {
  // gcTime: 0 — форма инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['intent', id], queryFn: () => api.intents.get(id), gcTime: 0 });
  if (!data) return null;
  return <IntentForm key={id} intent={data} />;
}

export function IntentsPage() {
  const { id } = useParams();
  return (
    <MasterDetail list={<IntentList />}>
      {id ? <IntentEditor id={Number(id)} /> : <EmptyDetail />}
    </MasterDetail>
  );
}
```

- [ ] **Step 6: Проверка**

Run: `npm run typecheck -w web; npm run dev`
Ручная проверка: создать интент «Вернуться» в группе «Меню» → слот `comp` с сущностью `@compliment`, переключатели «Обязательно»/«Массив», вопрос с запятой остаётся одним тегом; добавить фразы по Enter; вставить 3 строки сразу из буфера → 3 фразы; выбрать две и «Удалить выбранные»; поиск по фразам; «Сохранено» появляется; перезагрузка — всё на месте; переименование в уже существующее имя показывает тост «Элемент с таким названием уже существует»; группы сворачиваются; удаление с подтверждением. Остановить dev.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): intents section"
```

---

### Task 7: API сценариев

**Files:**
- Create: `server/src/routes/scenarios.ts`, `server/test/scenarios.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: хелперы Task 1; таблицы `scenarios`, `scenario_steps`, `intents`.
- Produces (REST):
  - `GET /api/projects/:pid/scenarios` → `{ id, name, step_count }[]` (порядок по `id`)
  - `POST /api/projects/:pid/scenarios` `{ name }` → `201 { id, name }`
  - `GET /api/scenarios/:id` → `{ id, project_id, name, description, steps: { intent_id: number|null, system_reply, system_action }[] }`
  - `PUT /api/scenarios/:id` `{ name, description, steps }` — полная замена, порядок шагов = порядок массива; `intent_id` чужого проекта → 400; ответ как у GET
  - `DELETE /api/scenarios/:id` → `204`

- [ ] **Step 1: Падающий тест**

`server/test/scenarios.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

async function setup() {
  const { app } = makeApp();
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  const pid = p.body.id as number;
  const i = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'Вернуться' });
  return { app, pid, intentId: i.body.id as number };
}

describe('scenarios API', () => {
  it('creates, lists and loads an empty scenario', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'Возврат в игру' });
    expect(c.status).toBe(201);
    expect((await request(app).get(`/api/projects/${pid}/scenarios`)).body).toEqual([
      { id: c.body.id, name: 'Возврат в игру', step_count: 0 },
    ]);
    expect((await request(app).get(`/api/scenarios/${c.body.id}`)).body).toMatchObject({
      name: 'Возврат в игру', description: '', steps: [],
    });
  });

  it('PUT replaces steps and keeps their order', async () => {
    const { app, pid, intentId } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const put = await request(app)
      .put(`/api/scenarios/${c.body.id}`)
      .send({
        name: 'S', description: 'описание',
        steps: [
          { key: 'k', intent_id: intentId, system_reply: 'Продолжаем!', system_action: 'Вернуть в игру' },
          { intent_id: null, system_reply: 'Ещё', system_action: '' },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.steps).toEqual([
      { intent_id: intentId, system_reply: 'Продолжаем!', system_action: 'Вернуть в игру' },
      { intent_id: null, system_reply: 'Ещё', system_action: '' },
    ]);
    const list = await request(app).get(`/api/projects/${pid}/scenarios`);
    expect(list.body[0].step_count).toBe(2);
  });

  it('rejects an intent from another project', async () => {
    const { app, pid } = await setup();
    const other = await request(app).post('/api/projects').send({ name: 'Other' });
    const foreign = await request(app).post(`/api/projects/${other.body.id}/intents`).send({ name: 'X' });
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    const put = await request(app)
      .put(`/api/scenarios/${c.body.id}`)
      .send({ name: 'S', description: '', steps: [{ intent_id: foreign.body.id, system_reply: '', system_action: '' }] });
    expect(put.status).toBe(400);
  });

  it('deletes a scenario', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    expect((await request(app).delete(`/api/scenarios/${c.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/scenarios/${c.body.id}`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -w server -- scenarios`
Expected: FAIL.

- [ ] **Step 3: Реализация**

`server/src/routes/scenarios.ts`:
```ts
import { Router } from 'express';
import type { Db } from '../db';
import { badRequest, notFound } from '../errors';
import { optString, parseId, requireString } from '../validate';

export function scenariosRouter(db: Db): Router {
  const r = Router();

  const load = (id: number) => {
    const s = db.prepare('SELECT id, project_id, name, description FROM scenarios WHERE id = ?').get(id) as
      | { id: number; project_id: number; name: string; description: string }
      | undefined;
    if (!s) throw notFound('Сценарий');
    const steps = db
      .prepare('SELECT intent_id, system_reply, system_action FROM scenario_steps WHERE scenario_id = ? ORDER BY position, id')
      .all(id);
    return { ...s, steps };
  };

  r.get('/projects/:pid/scenarios', (req, res) => {
    const pid = parseId(req.params.pid);
    res.json(
      db
        .prepare(
          `SELECT s.id, s.name,
                  (SELECT COUNT(*) FROM scenario_steps t WHERE t.scenario_id = s.id) AS step_count
           FROM scenarios s WHERE s.project_id = ? ORDER BY s.id`,
        )
        .all(pid),
    );
  });

  r.post('/projects/:pid/scenarios', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = requireString(req.body?.name, 'Название');
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const info = db.prepare('INSERT INTO scenarios(project_id, name) VALUES (?, ?)').run(pid, name);
    res.status(201).json({ id: Number(info.lastInsertRowid), name });
  });

  r.get('/scenarios/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/scenarios/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const b = (req.body ?? {}) as Record<string, any>;
    const name = requireString(b.name, 'Название');
    const steps = (Array.isArray(b.steps) ? b.steps : []).map((s: any) => ({
      intent_id: s?.intent_id == null ? null : parseId(s.intent_id),
      system_reply: optString(s?.system_reply),
      system_action: optString(s?.system_action),
    }));
    const findIntent = db.prepare('SELECT 1 FROM intents WHERE id = ? AND project_id = ?');
    for (const s of steps) {
      if (s.intent_id !== null && !findIntent.get(s.intent_id, cur.project_id)) {
        throw badRequest('Интент шага не найден в проекте');
      }
    }
    db.transaction(() => {
      db.prepare('UPDATE scenarios SET name = ?, description = ? WHERE id = ?').run(name, optString(b.description), id);
      db.prepare('DELETE FROM scenario_steps WHERE scenario_id = ?').run(id);
      const ins = db.prepare(
        'INSERT INTO scenario_steps(scenario_id, position, intent_id, system_reply, system_action) VALUES (?, ?, ?, ?, ?)',
      );
      steps.forEach((s: any, i: number) => ins.run(id, i, s.intent_id, s.system_reply, s.system_action));
    })();
    res.json(load(id));
  });

  r.delete('/scenarios/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
```

В `server/src/app.ts`: `import { scenariosRouter } from './routes/scenarios';` и `app.use('/api', scenariosRouter(db));`.

- [ ] **Step 4: Запустить тесты**

Run: `npm test -w server; npm run typecheck -w server`
Expected: все тесты PASS (19), typecheck чистый.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): scenarios API"
```

---

### Task 8: UI раздела «Сценарии»

**Files:**
- Modify: `web/src/lib/api.ts` (добавить `api.scenarios`)
- Create: `web/src/pages/scenarios/{ScenarioList,ScenarioForm,StepsTable}.tsx`
- Modify: `web/src/pages/scenarios/ScenariosPage.tsx`

**Interfaces:**
- Consumes: `/api/scenarios` (Task 7), `api.intents.list` с ключом `['intents', projectId]` (Task 6), общие компоненты, `@dnd-kit/*`, типы `Scenario`, `ScenarioListItem`, `Step`.
- Produces: `api.scenarios.{list(pid), get(id), create(pid, name), save(id, body), remove(id)}`.

- [ ] **Step 1: Расширить API-клиент**

В `web/src/lib/api.ts` добавить импорт `Scenario, ScenarioListItem` и секцию:
```ts
  scenarios: {
    list: (pid: number) => req<ScenarioListItem[]>('GET', `/api/projects/${pid}/scenarios`),
    get: (id: number) => req<Scenario>('GET', `/api/scenarios/${id}`),
    create: (pid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/projects/${pid}/scenarios`, { name }),
    save: (id: number, body: Omit<Scenario, 'id' | 'project_id'>) => req<Scenario>('PUT', `/api/scenarios/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/scenarios/${id}`),
  },
```

- [ ] **Step 2: Список сценариев**

`web/src/pages/scenarios/ScenarioList.tsx` — по образцу `EntityList` (Task 4), с заменами: ключ `['scenarios', projectId]`, `api.scenarios.list/create`, ссылки `/scenarios/${s.id}`, заголовок «Сценарии», диалог «Новый сценарий», пустой текст «Сценариев пока нет», счётчик справа — `s.step_count`, название без префикса `@`:
```tsx
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateDialog } from '@/components/CreateDialog';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ScenarioList() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: items = [] } = useQuery({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId) });
  const create = useMutation({
    mutationFn: (name: string) => api.scenarios.create(projectId, name),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['scenarios', projectId] });
      navigate(`/scenarios/${s.id}`);
    },
  });

  return (
    <>
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-sm font-medium">Сценарии</span>
        <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Создать
        </Button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {items.map((s) => (
          <li key={s.id}>
            <NavLink
              to={`/scenarios/${s.id}`}
              className={({ isActive }) =>
                cn('flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-muted', isActive && 'bg-muted font-medium')
              }
            >
              <span className="truncate">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.step_count}</span>
            </NavLink>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Сценариев пока нет</li>}
      </ul>
      <CreateDialog open={creating} onOpenChange={setCreating} title="Новый сценарий" onCreate={(n) => create.mutate(n)} />
    </>
  );
}
```

- [ ] **Step 3: Таблица шагов с перетаскиванием**

`web/src/pages/scenarios/StepsTable.tsx`:
```tsx
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { IntentListItem, Step } from '@/lib/types';

interface Props {
  steps: Step[];
  intents: IntentListItem[];
  onChange: (steps: Step[]) => void;
}

interface RowProps {
  step: Step;
  index: number;
  intents: IntentListItem[];
  onPatch: (p: Partial<Step>) => void;
  onRemove: () => void;
}

function StepRow({ step, index, intents, onPatch, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.key! });
  return (
    <TableRow ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="align-top">
      <TableCell className="w-16">
        <div className="flex items-center gap-1 pt-2 text-sm text-muted-foreground">
          <button type="button" aria-label="Перетащить шаг" className="cursor-grab" {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
          {index + 1}
        </div>
      </TableCell>
      <TableCell className="w-64">
        <Select
          value={step.intent_id === null ? 'none' : String(step.intent_id)}
          onValueChange={(v) => onPatch({ intent_id: v === 'none' ? null : Number(v) })}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— не выбран —</SelectItem>
            {intents.map((i) => (
              <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Textarea rows={2} value={step.system_reply} onChange={(e) => onPatch({ system_reply: e.target.value })} aria-label="Ответ системы" />
      </TableCell>
      <TableCell>
        <Textarea rows={2} value={step.system_action} onChange={(e) => onPatch({ system_action: e.target.value })} aria-label="Действие системы" />
      </TableCell>
      <TableCell className="w-10">
        <Button variant="ghost" size="icon" aria-label="Удалить шаг" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function StepsTable({ steps, intents, onChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = steps.findIndex((s) => s.key === active.id);
    const to = steps.findIndex((s) => s.key === over.id);
    onChange(arrayMove(steps, from, to));
  };
  const patch = (i: number, p: Partial<Step>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const add = () =>
    onChange([...steps, { key: crypto.randomUUID(), intent_id: null, system_reply: '', system_action: '' }]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Шаги</h2>
        <Button size="sm" variant="outline" onClick={add}>Добавить шаг</Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s.key!)} strategy={verticalListSortingStrategy}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">№</TableHead>
                <TableHead className="w-64">Интент</TableHead>
                <TableHead>Ответ системы</TableHead>
                <TableHead>Действие системы</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {steps.map((s, i) => (
                <StepRow
                  key={s.key}
                  step={s}
                  index={i}
                  intents={intents}
                  onPatch={(p) => patch(i, p)}
                  onRemove={() => onChange(steps.filter((_, j) => j !== i))}
                />
              ))}
              {steps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">Шагов пока нет</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </SortableContext>
      </DndContext>
    </section>
  );
}
```

- [ ] **Step 4: Форма сценария и страница**

`web/src/pages/scenarios/ScenarioForm.tsx`:
```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import type { Scenario } from '@/lib/types';
import { StepsTable } from './StepsTable';

type Draft = Pick<Scenario, 'name' | 'description' | 'steps'>;

export function ScenarioForm({ scenario }: { scenario: Scenario }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>({
    name: scenario.name,
    description: scenario.description,
    steps: scenario.steps.map((s) => ({ ...s, key: crypto.randomUUID() })),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: intents = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });

  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.scenarios.save(scenario.id, d);
    qc.invalidateQueries({ queryKey: ['scenarios', projectId] });
  });

  const remove = useMutation({
    mutationFn: () => api.scenarios.remove(scenario.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenarios', projectId] });
      navigate('/scenarios');
    },
  });

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Input className="text-lg font-medium" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Название сценария" />
          <Textarea rows={2} placeholder="Описание" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <SaveIndicator state={status} />
          <Button variant="ghost" size="icon" aria-label="Удалить сценарий" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <StepsTable steps={draft.steps} intents={intents} onChange={(steps) => setDraft({ ...draft, steps })} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Удалить сценарий «${scenario.name}»?`}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
```

`web/src/pages/scenarios/ScenariosPage.tsx` (заменить):
```tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyDetail, MasterDetail } from '@/components/MasterDetail';
import { api } from '@/lib/api';
import { ScenarioForm } from './ScenarioForm';
import { ScenarioList } from './ScenarioList';

function ScenarioEditor({ id }: { id: number }) {
  // gcTime: 0 — форма инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['scenario', id], queryFn: () => api.scenarios.get(id), gcTime: 0 });
  if (!data) return null;
  return <ScenarioForm key={id} scenario={data} />;
}

export function ScenariosPage() {
  const { id } = useParams();
  return (
    <MasterDetail list={<ScenarioList />}>
      {id ? <ScenarioEditor id={Number(id)} /> : <EmptyDetail />}
    </MasterDetail>
  );
}
```

- [ ] **Step 5: Проверка**

Run: `npm run typecheck -w web; npm run dev`
Ручная проверка: создать сценарий «Возврат в игру»; добавить 3 шага, выбрать интенты из списка, заполнить ответы и действия; перетащить третий шаг на первое место (мышью за иконку и клавиатурой: Tab на иконку, Пробел, стрелки, Пробел); перезагрузить — порядок и тексты сохранены; удалить интент в разделе «Интенты» — шаг остаётся с «— не выбран —». Остановить dev.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): scenarios section"
```

---

### Task 9: Экспорт в MD и DOCX

**Files:**
- Create: `server/src/export/{model,tables,markdown,docx}.ts`, `server/src/routes/export.ts`
- Create: `server/test/export.test.ts`
- Modify: `server/src/app.ts`
- Create: `web/src/components/ExportMenu.tsx`
- Modify: `web/src/components/AppShell.tsx` (вставить ExportMenu в шапку)

**Interfaces:**
- Consumes: все таблицы БД; `api.exportUrl(projectId, format)` из Task 2.
- Produces:
  - `ProjectSpec` (см. ниже), `loadProjectSpec(db, projectId): ProjectSpec`
  - `renderMarkdown(spec: ProjectSpec, date: string): string`
  - `renderDocx(spec: ProjectSpec, date: string): Promise<Buffer>`
  - `GET /api/projects/:id/export?format=md|docx` → файл с `Content-Disposition: attachment; filename*=UTF-8''<имя проекта>.<format>`; неверный `format` → 400; нет проекта → 404.

- [ ] **Step 1: Падающий тест генераторов и роута**

`server/test/export.test.ts`:
```ts
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { renderDocx } from '../src/export/docx';
import { renderMarkdown } from '../src/export/markdown';
import type { ProjectSpec } from '../src/export/model';
import { makeApp } from './helpers';

const spec: ProjectSpec = {
  project: { id: 1, name: 'Вампус', description: '' },
  entities: [
    { name: 'compliment', description: '', values: [{ value: 'красавчик', synonyms: ['молодец', 'умница'] }] },
  ],
  intents: [
    {
      name: 'Вернуться', path: '/Вернуться', group_name: '', enabled: true, comment: '',
      slots: [{ name: 'comp', entity: 'compliment', required: true, is_array: false, prompts: [] }],
      phrases: ['* (вернуться/вернись) в игру* *'],
    },
  ],
  scenarios: [
    {
      name: 'Возврат', description: '',
      steps: [{ intent: 'Вернуться', system_reply: 'Продолжаем!', system_action: 'Вернуть в игру' }],
    },
  ],
};

describe('renderMarkdown', () => {
  it('renders the full document', () => {
    const expected = [
      '# Вампус',
      '',
      '_Спецификация от 2026-10-17_',
      '',
      '## Сущности',
      '',
      '### @compliment',
      '',
      '| Значение | Синонимы |',
      '|---|---|',
      '| красавчик | молодец, умница |',
      '',
      '## Интенты',
      '',
      '### Вернуться',
      '',
      'Путь: `/Вернуться`',
      '',
      '**Слоты**',
      '',
      '| Название | Сущность | Обязательно | Массив | Вопросы |',
      '|---|---|---|---|---|',
      '| comp | @compliment | да | нет |  |',
      '',
      '**Тренировочные фразы**',
      '',
      '- `* (вернуться/вернись) в игру* *`',
      '',
      '## Сценарии',
      '',
      '### Возврат',
      '',
      '| № | Интент | Ответ системы | Действие системы |',
      '|---|---|---|---|',
      '| 1 | Вернуться | Продолжаем! | Вернуть в игру |',
      '',
    ].join('\n');
    expect(renderMarkdown(spec, '2026-10-17')).toBe(expected);
  });

  it('escapes pipes and newlines in table cells', () => {
    const s: ProjectSpec = {
      ...spec,
      scenarios: [{ name: 'S', description: '', steps: [{ intent: null, system_reply: 'a|b\nc', system_action: '' }] }],
    };
    expect(renderMarkdown(s, 'd')).toContain('| 1 | — | a\\|b<br>c |  |');
  });
});

describe('renderDocx', () => {
  it('produces a zip with the document text', async () => {
    const buf = await renderDocx(spec, '2026-10-17');
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const text of ['Вампус', 'compliment', 'Вернуться', 'Возврат', 'Продолжаем!']) {
      expect(xml).toContain(text);
    }
  });
});

describe('export route', () => {
  async function setup() {
    const { app } = makeApp();
    const p = await request(app).post('/api/projects').send({ name: 'Вампус' });
    return { app, pid: p.body.id as number };
  }

  it('returns markdown as an attachment', async () => {
    const { app, pid } = await setup();
    const res = await request(app).get(`/api/projects/${pid}/export?format=md`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('Вампус')}.md`);
    expect(res.text).toContain('# Вампус');
  });

  it('returns a docx file', async () => {
    const { app, pid } = await setup();
    const res = await request(app)
      .get(`/api/projects/${pid}/export?format=docx`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('validates format and project', async () => {
    const { app, pid } = await setup();
    expect((await request(app).get(`/api/projects/${pid}/export?format=pdf`)).status).toBe(400);
    expect((await request(app).get('/api/projects/999/export?format=md')).status).toBe(404);
  });

  it('exports real content from the database', async () => {
    const { app, pid } = await setup();
    const i = await request(app).post(`/api/projects/${pid}/intents`).send({ name: 'Играть' });
    await request(app).put(`/api/intents/${i.body.id}`).send({
      name: 'Играть', path: '/Играть', group_name: 'Меню', enabled: true, comment: '', slots: [], phrases: ['играть'],
    });
    const res = await request(app).get(`/api/projects/${pid}/export?format=md`);
    expect(res.text).toContain('### Играть');
    expect(res.text).toContain('Группа: Меню');
    expect(res.text).toContain('- `играть`');
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -w server -- export`
Expected: FAIL (модули `../src/export/*` не найдены).

- [ ] **Step 3: Модель данных экспорта**

`server/src/export/model.ts`:
```ts
import type { Db } from '../db';
import { notFound } from '../errors';

export interface ProjectSpec {
  project: { id: number; name: string; description: string };
  entities: { name: string; description: string; values: { value: string; synonyms: string[] }[] }[];
  intents: {
    name: string; path: string; group_name: string; enabled: boolean; comment: string;
    slots: { name: string; entity: string | null; required: boolean; is_array: boolean; prompts: string[] }[];
    phrases: string[];
  }[];
  scenarios: {
    name: string; description: string;
    steps: { intent: string | null; system_reply: string; system_action: string }[];
  }[];
}

export function loadProjectSpec(db: Db, projectId: number): ProjectSpec {
  const project = db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(projectId) as
    | ProjectSpec['project']
    | undefined;
  if (!project) throw notFound('Проект');

  const entities = (
    db.prepare('SELECT id, name, description FROM entities WHERE project_id = ? ORDER BY name').all(projectId) as {
      id: number; name: string; description: string;
    }[]
  ).map((e) => ({
    name: e.name,
    description: e.description,
    values: (
      db.prepare('SELECT value, synonyms FROM entity_values WHERE entity_id = ? ORDER BY position, id').all(e.id) as {
        value: string; synonyms: string;
      }[]
    ).map((v) => ({ value: v.value, synonyms: JSON.parse(v.synonyms) as string[] })),
  }));

  const intents = (
    db
      .prepare('SELECT id, name, path, group_name, enabled, comment FROM intents WHERE project_id = ? ORDER BY group_name, name')
      .all(projectId) as { id: number; name: string; path: string; group_name: string; enabled: number; comment: string }[]
  ).map((i) => ({
    name: i.name,
    path: i.path,
    group_name: i.group_name,
    enabled: !!i.enabled,
    comment: i.comment,
    slots: (
      db
        .prepare(
          `SELECT s.name, e.name AS entity, s.required, s.is_array, s.prompts
           FROM intent_slots s LEFT JOIN entities e ON e.id = s.entity_id
           WHERE s.intent_id = ? ORDER BY s.position, s.id`,
        )
        .all(i.id) as { name: string; entity: string | null; required: number; is_array: number; prompts: string }[]
    ).map((s) => ({
      name: s.name, entity: s.entity, required: !!s.required, is_array: !!s.is_array,
      prompts: JSON.parse(s.prompts) as string[],
    })),
    phrases: (
      db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(i.id) as { text: string }[]
    ).map((p) => p.text),
  }));

  const scenarios = (
    db.prepare('SELECT id, name, description FROM scenarios WHERE project_id = ? ORDER BY id').all(projectId) as {
      id: number; name: string; description: string;
    }[]
  ).map((s) => ({
    name: s.name,
    description: s.description,
    steps: db
      .prepare(
        `SELECT i.name AS intent, t.system_reply, t.system_action
         FROM scenario_steps t LEFT JOIN intents i ON i.id = t.intent_id
         WHERE t.scenario_id = ? ORDER BY t.position, t.id`,
      )
      .all(s.id) as { intent: string | null; system_reply: string; system_action: string }[],
  }));

  return { project, entities, intents, scenarios };
}
```

- [ ] **Step 4: Общие таблицы, Markdown, DOCX**

`server/src/export/tables.ts`:
```ts
import type { ProjectSpec } from './model';

export const ENTITY_HEAD = ['Значение', 'Синонимы'];
export const SLOT_HEAD = ['Название', 'Сущность', 'Обязательно', 'Массив', 'Вопросы'];
export const STEP_HEAD = ['№', 'Интент', 'Ответ системы', 'Действие системы'];

const yn = (b: boolean) => (b ? 'да' : 'нет');

export const valueRows = (e: ProjectSpec['entities'][number]): string[][] =>
  e.values.map((v) => [v.value, v.synonyms.join(', ')]);

export const slotRows = (i: ProjectSpec['intents'][number]): string[][] =>
  i.slots.map((s) => [s.name, s.entity ? `@${s.entity}` : '—', yn(s.required), yn(s.is_array), s.prompts.join('; ')]);

export const stepRows = (s: ProjectSpec['scenarios'][number]): string[][] =>
  s.steps.map((t, n) => [String(n + 1), t.intent ?? '—', t.system_reply, t.system_action]);

export const intentMeta = (i: ProjectSpec['intents'][number]): string[] =>
  [i.path && `Путь: \`${i.path}\``, i.group_name && `Группа: ${i.group_name}`, !i.enabled && 'Интент выключен'].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
```

`server/src/export/markdown.ts`:
```ts
import type { ProjectSpec } from './model';
import { ENTITY_HEAD, SLOT_HEAD, STEP_HEAD, intentMeta, slotRows, stepRows, valueRows } from './tables';

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
}

export function renderMarkdown(spec: ProjectSpec, date: string): string {
  const out: string[] = [`# ${spec.project.name}`, `_Спецификация от ${date}_`];
  if (spec.project.description) out.push(spec.project.description);

  out.push('## Сущности');
  if (!spec.entities.length) out.push('_Нет сущностей._');
  for (const e of spec.entities) {
    out.push(`### @${e.name}`);
    if (e.description) out.push(e.description);
    out.push(e.values.length ? table(ENTITY_HEAD, valueRows(e)) : '_Нет значений._');
  }

  out.push('## Интенты');
  if (!spec.intents.length) out.push('_Нет интентов._');
  for (const i of spec.intents) {
    out.push(`### ${i.name}`);
    const meta = intentMeta(i).join(' · ');
    if (meta) out.push(meta);
    if (i.comment) out.push(i.comment);
    out.push('**Слоты**');
    out.push(i.slots.length ? table(SLOT_HEAD, slotRows(i)) : '_Нет слотов._');
    out.push('**Тренировочные фразы**');
    out.push(i.phrases.length ? i.phrases.map((p) => `- \`${p}\``).join('\n') : '_Нет фраз._');
  }

  out.push('## Сценарии');
  if (!spec.scenarios.length) out.push('_Нет сценариев._');
  for (const s of spec.scenarios) {
    out.push(`### ${s.name}`);
    if (s.description) out.push(s.description);
    out.push(s.steps.length ? table(STEP_HEAD, stepRows(s)) : '_Нет шагов._');
  }

  return out.join('\n\n') + '\n';
}
```

`server/src/export/docx.ts`:
```ts
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { ProjectSpec } from './model';
import { ENTITY_HEAD, SLOT_HEAD, STEP_HEAD, slotRows, stepRows, valueRows } from './tables';

type Level = (typeof HeadingLevel)[keyof typeof HeadingLevel];
type Block = Paragraph | Table;

const para = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) =>
  new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } });
const heading = (text: string, level: Level) => new Paragraph({ text, heading: level });

function tableBlocks(head: string[], rows: string[][]): Block[] {
  const mk = (cells: string[], bold: boolean) =>
    new TableRow({
      tableHeader: bold,
      children: cells.map(
        (c) =>
          new TableCell({
            children: c.split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun({ text: line, bold })] })),
          }),
      ),
    });
  return [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(head, true), ...rows.map((r) => mk(r, false))] }),
    new Paragraph({ text: '' }),
  ];
}

export async function renderDocx(spec: ProjectSpec, date: string): Promise<Buffer> {
  const c: Block[] = [heading(spec.project.name, HeadingLevel.TITLE), para(`Спецификация от ${date}`, { italics: true })];
  if (spec.project.description) c.push(para(spec.project.description));

  c.push(heading('Сущности', HeadingLevel.HEADING_1));
  if (!spec.entities.length) c.push(para('Нет сущностей.', { italics: true }));
  for (const e of spec.entities) {
    c.push(heading(`@${e.name}`, HeadingLevel.HEADING_2));
    if (e.description) c.push(para(e.description));
    c.push(...(e.values.length ? tableBlocks(ENTITY_HEAD, valueRows(e)) : [para('Нет значений.', { italics: true })]));
  }

  c.push(heading('Интенты', HeadingLevel.HEADING_1));
  if (!spec.intents.length) c.push(para('Нет интентов.', { italics: true }));
  for (const i of spec.intents) {
    c.push(heading(i.name, HeadingLevel.HEADING_2));
    const meta = [i.path && `Путь: ${i.path}`, i.group_name && `Группа: ${i.group_name}`, !i.enabled && 'Интент выключен']
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
      .join(' · ');
    if (meta) c.push(para(meta));
    if (i.comment) c.push(para(i.comment));
    c.push(para('Слоты', { bold: true }));
    c.push(...(i.slots.length ? tableBlocks(SLOT_HEAD, slotRows(i)) : [para('Нет слотов.', { italics: true })]));
    c.push(para('Тренировочные фразы', { bold: true }));
    if (!i.phrases.length) c.push(para('Нет фраз.', { italics: true }));
    for (const p of i.phrases) c.push(new Paragraph({ children: [new TextRun({ text: p, font: 'Consolas' })], bullet: { level: 0 } }));
  }

  c.push(heading('Сценарии', HeadingLevel.HEADING_1));
  if (!spec.scenarios.length) c.push(para('Нет сценариев.', { italics: true }));
  for (const s of spec.scenarios) {
    c.push(heading(s.name, HeadingLevel.HEADING_2));
    if (s.description) c.push(para(s.description));
    c.push(...(s.steps.length ? tableBlocks(STEP_HEAD, stepRows(s)) : [para('Нет шагов.', { italics: true })]));
  }

  return Packer.toBuffer(new Document({ sections: [{ children: c }] }));
}
```

- [ ] **Step 5: Роут экспорта**

`server/src/routes/export.ts`:
```ts
import { Router } from 'express';
import type { Db } from '../db';
import { badRequest } from '../errors';
import { renderDocx } from '../export/docx';
import { renderMarkdown } from '../export/markdown';
import { loadProjectSpec } from '../export/model';
import { parseId } from '../validate';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function exportRouter(db: Db): Router {
  const r = Router();

  r.get('/projects/:id/export', async (req, res) => {
    const id = parseId(req.params.id);
    const format = req.query.format;
    if (format !== 'md' && format !== 'docx') throw badRequest('Параметр format должен быть md или docx');
    const spec = loadProjectSpec(db, id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(spec.project.name)}.${format}`);
    if (format === 'md') {
      res.type('text/markdown; charset=utf-8').send(renderMarkdown(spec, date));
    } else {
      res.type(DOCX_TYPE).send(await renderDocx(spec, date));
    }
  });

  return r;
}
```

В `server/src/app.ts`: `import { exportRouter } from './routes/export';` и `app.use('/api', exportRouter(db));`.

- [ ] **Step 6: Запустить тесты**

Run: `npm test -w server; npm run typecheck -w server`
Expected: все тесты PASS (27), typecheck чистый. Если точное сравнение Markdown падает на пробелах — привести генератор к ожидаемому тексту теста (тест — источник истины для формата, он записан по спецификации).

- [ ] **Step 7: Кнопка «Экспорт» в шапке**

`web/src/components/ExportMenu.tsx`:
```tsx
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

export function ExportMenu() {
  const projectId = useProjectId();
  // Ответ с Content-Disposition: attachment — браузер скачивает файл, страница не уходит
  const download = (format: 'md' | 'docx') => {
    window.location.href = api.exportUrl(projectId, format);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4" /> Экспорт
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => download('md')}>Markdown (.md)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download('docx')}>Word (.docx)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

В `web/src/components/AppShell.tsx` добавить `import { ExportMenu } from '@/components/ExportMenu';` и заменить строку `<div id="header-actions" className="flex items-center gap-2" />` на `<ExportMenu />`.

- [ ] **Step 8: Проверка**

Run: `npm run typecheck -w web; npm run dev`
Ручная проверка: «Экспорт → Markdown» скачивает `<проект>.md` с сущностями, интентами и сценариями, введёнными в Tasks 4/6/8; «Word» скачивает `.docx`, который открывается в Word/LibreOffice с заголовками и таблицами. Остановить dev.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: export project spec to Markdown and DOCX"
```

---

### Task 10: Production-режим, README, итоговая проверка

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: всё из Tasks 1–9. `createApp` уже отдаёт `web/dist` при его наличии.

- [ ] **Step 1: README**

`README.md`:
```markdown
# CUI Spec Maker

Локальный сервис для описания интентов, сущностей и сценариев голосового помощника с экспортом в MD и DOCX.

## Запуск

    npm install
    npm run dev      # разработка: фронтенд http://localhost:5173, API :3001
    npm run build    # сборка фронтенда в web/dist
    npm start        # всё на http://127.0.0.1:3001 (после build)

Данные: `data/spec.db` (SQLite). Копия файла = резервная копия.

## Тесты

    npm test
```

- [ ] **Step 2: Полный прогон автоматических проверок**

Run:
```bash
npm test; npm run typecheck -w server; npm run typecheck -w web; npm run build
```
Expected: server 27 tests PASS, web 4 tests PASS, оба typecheck чистые, `web/dist` создан без ошибок.

- [ ] **Step 3: Production-запуск**

Run: `npm start` (в фоне) и открыть `http://127.0.0.1:3001`.
Expected: приложение открывается с одного порта; прямой переход на `http://127.0.0.1:3001/intents` отдаёт приложение (SPA-fallback), `http://127.0.0.1:3001/api/projects` отдаёт JSON.

- [ ] **Step 4: Сквозной ручной чек-лист (на скриншоте-образце)**

В production-режиме воспроизвести пример со скриншота и пройти по пунктам:
1. Создать проект «Тестовый Вампус».
2. Сущность `compliment` со значениями и синонимами.
3. Интент «Вернуться» (группа «Меню»): слот `comp` → `@compliment`, «Обязательно: Да», «Массив: Нет»; фразы `* (закрыть/убрать) (помощь/правила/мануал/гайд)* *`, `* (продолжить/продолжим/возобновим/возобновить) игру* *`, `* (вернуться/вернись/назад/вернёмся/возвращаемся) в игру* *`.
4. Сценарий «Возврат в игру» с шагами: «Вернуться → Продолжаем игру! → Вернуть пользователя в игру».
5. Экспорт MD и DOCX — все данные в документах; фразы-паттерны со звёздочками не искажены.
6. Создать второй проект — он пуст; переключение туда и обратно сохраняет данные каждого.
7. Перезапустить сервер — данные на месте.
8. Любое удаление спрашивает подтверждение; удаление сущности, используемой в слоте, показывает список интентов.
Остановить сервер.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: README and production run check"
```

---

## Self-Review

**Покрытие спецификации:**
- Хранение SQLite + локальный сервер → Task 1 (схема, `openDb`), `data/spec.db` в `.gitignore`.
- Стек, один порт в production, `npm run dev` → Tasks 1, 2, 10.
- Дизайн (монохром, один акцент, Inter, без теней) → Task 2 Step 3 (`--brand`, `--tw-shadow` обнулён, фокус-кольца сохранены).
- Модель данных (8 таблиц, каскады, уникальность) → Task 1 схема; поведение удаления сущности → Task 3.
- Несколько проектов, переключатель с созданием → Tasks 1, 2.
- Экран «Интенты» (группы, поиск, счётчик, слоты, фразы, массовая вставка, массовое удаление, автосохранение) → Tasks 5, 6.
- Экран «Сущности» (теги синонимов, массовая вставка, «используется в интентах») → Tasks 3, 4.
- Экран «Сценарии» (шаги, перетаскивание) → Tasks 7, 8.
- Экспорт MD/DOCX, структура из 4 частей → Task 9.
- Ошибки (JSON `{error,message}`, тосты, дубли/пустые на клиенте и сервере, диалоги подтверждения) → Tasks 1–9. Клиентская проверка пустых имён: автосохранение пропускает пустое имя, диалоги создания блокируют пустое; дубли ловит сервер (409 → тост).
- Тесты (Vitest: роуты на `:memory:`, генераторы экспорта) → Tasks 1, 3, 5, 7, 9; чистые функции фронтенда → Task 2.
- Порядок реализации из спецификации сохранён (каркас → сущности → интенты → сценарии → экспорт), каждый раздел разбит на API и UI.

**Плейсхолдеры:** нет TBD/TODO; весь код приведён целиком. Единственное «по образцу» — `ScenarioList` в Task 8, но там дан полный код.

**Согласованность типов и имён:** `Db`, `parseId`, `requireString`, `optString`, `cleanStrings` (Task 1) используются в Tasks 3, 5, 7, 9 с теми же сигнатурами. Query-ключи `['entities', pid]`, `['intents', pid]`, `['scenarios', pid]`, `['entity', id]`, `['intent', id]`, `['scenario', id]` едины между Tasks 4, 6, 8. `ProjectSpec` определён в Task 9 и используется только там. `Slot.key` / `Step.key` — клиентские поля, сервер их игнорирует (проверено в тестах Tasks 5 и 7). Формы API `PUT` совпадают с типами `api.*.save`.
