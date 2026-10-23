# Пересечения тренировочных фраз: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отчёт «Пересечения фраз» на странице сценария: пары интентов проекта с совпадающими тренировочными фразами.

**Architecture:** Чистая функция `findPhraseConflicts` в core, эндпоинт `GET /scenarios/:sid/intents/conflicts`, диалог-отчёт в web рядом с `ExportMenu`. Спецификация: `docs/superpowers/specs/2026-10-23-phrase-conflicts-design.md`.

**Tech Stack:** TypeScript, sql.js, vitest, React, TanStack Query, base-ui Dialog.

## Global Constraints

- Типы совпадений: `exact` (ошибка), `template` (предупреждение), `followup` (ответ на уточнение, по умолчанию скрыт).
- Служебные слова: «в», «во», «на», «для», «по», «к», «ко», «с», «со», «у», «из», «до», «за».
- Выключенные интенты и пустые фразы пропускаются; пары внутри одного интента не строятся.
- `buildChecks`, `buildCriteria` и экспорт не меняются.
- Тексты интерфейса на русском.

---

### Task 1: Функция `findPhraseConflicts`

**Files:**
- Create: `core/src/phrase-conflicts.ts`
- Test: `core/test/phrase-conflicts.test.ts`

**Interfaces:**
- Produces: `findPhraseConflicts(intents: IntentForCheck[]): ConflictPair[]`, типы `ConflictKind`, `IntentForCheck`, `ConflictPair`.

- [ ] **Step 1: Написать тесты** (`core/test/phrase-conflicts.test.ts`): дословное совпадение, регистр/пунктуация/ё, шаблон с сущностью, ответ на уточнение, многословные значения, пустые фразы, повтор внутри интента.
- [ ] **Step 2: Запустить `npm run test -w core -- phrase-conflicts`, убедиться, что падает** (модуля нет).
- [ ] **Step 3: Реализовать `core/src/phrase-conflicts.ts`**: токенизация `/[^\p{L}\p{N}]+/u`, замена «ё», шаблон по самому длинному совпадению значения сущности, индексы по тексту и по шаблону, пары по группам из разных интентов, классификация `followup` > `exact` > `template`, сортировка.
- [ ] **Step 4: Запустить тесты, убедиться, что проходят.**
- [ ] **Step 5: Коммит** `feat: findPhraseConflicts`.

### Task 2: Эндпоинт

**Files:**
- Modify: `core/src/routes/intents.ts` (маршрут `GET /scenarios/:sid/intents/conflicts`)
- Test: `core/test/intents.test.ts`

**Interfaces:**
- Consumes: `findPhraseConflicts`, `IntentForCheck` из Task 1.
- Produces: `GET /api/scenarios/:sid/intents/conflicts` → `ConflictPair[]`; 404 для неизвестного сценария.

- [ ] **Step 1: Тесты в `intents.test.ts`**: пары внутри сценария и с интентом другого сценария; пара, где оба интента вне сценария, не возвращается; выключенный интент пропущен; 404.
- [ ] **Step 2: Запустить, убедиться, что падает.**
- [ ] **Step 3: Реализовать маршрут**: загрузить включённые интенты проекта, фразы, сущности (значения и синонимы), сценарии; вызвать функцию; оставить пары со сценарием `:sid`.
- [ ] **Step 4: Запустить `npm run test -w core`, всё зелёное.**
- [ ] **Step 5: Коммит** `feat: эндпоинт пересечений фраз`.

### Task 3: Интерфейс

**Files:**
- Modify: `web/src/lib/types.ts`, `web/src/lib/api.ts`, `web/src/pages/scenarios/ScenarioForm.tsx`
- Create: `web/src/pages/scenarios/PhraseConflicts.tsx`

**Interfaces:**
- Consumes: `GET /api/scenarios/:sid/intents/conflicts`.
- Produces: `api.intents.conflicts(sid)`, компонент `<PhraseConflicts scenarioId={number} />` (кнопка + диалог).

- [ ] **Step 1: Типы `ConflictPair`/`ConflictKind` и метод `api.intents.conflicts`.**
- [ ] **Step 2: Компонент**: кнопка со счётчиком `exact`+`template`; диалог грузит данные при открытии; группировка по паре интентов; ссылки на `/lists/intents/:id`; метка «в этом сценарии» или название другого; переключатель «Показать ответы на уточнения»; пустое состояние; ошибка с «Повторить».
- [ ] **Step 3: Подключить в шапку `ScenarioForm` перед `ExportMenu`.**
- [ ] **Step 4: `npm run build -w web` и `npm test`.**
- [ ] **Step 5: Коммит** `feat: отчёт о пересечениях фраз на странице сценария`.
