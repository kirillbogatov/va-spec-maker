# forge-wiki — VA Spec Maker

Spec-driven документация проекта: требования (БР) и реализация (BE/FE, контракты, схема БД, решения). Продукт — локальный сервис: сервера нет, ядро работает в браузере, «API» — запросы к локальному роутеру ядра.

Поверхности: `BR` — Бизнес требования, `GEN` — Общее, `ED` — Редактор. Трек: method. Режим конвейера: solo.

## Состав
- `planning/initiatives/01-va-spec-maker/` — [brief](planning/initiatives/01-va-spec-maker/brief.md), [feature-list](planning/initiatives/01-va-spec-maker/feature-list.md), [prd](planning/initiatives/01-va-spec-maker/prd.md), [spec](planning/initiatives/01-va-spec-maker/spec.md), [plan](planning/initiatives/01-va-spec-maker/plan.md), [discrepancies](planning/initiatives/01-va-spec-maker/discrepancies.md).
- `planning/architecture-spine/` — решения AD-01…AD-07; `planning/coding-guide.md`.
- `BR-Бизнес требования/` — UJ-1..8, CAP-1..14, FR-1..50, SM-1..13.
- `GEN-Общее/` — сквозная обработка запросов и ошибок.
- `ED-Редактор/` — листы-запросы: `-BE` (алгоритм на запрос), `-FE` (экран); `-QA` создаёт forge-test-design.
  - ED-01 Проекты, ED-02 Интенты, ED-03 Сущности, ED-04 Промпты, ED-05 Зависимости, ED-06 Ключевые слова, ED-07 Сценарии, ED-08 Экспорт, ED-09 Клиентские модули (только FE: вход, настройки, поиск, CSV, SVG, демо).
- `openapi/app/` — 54 операции (по файлу), реестр ошибок `errors/`. Реестра прав нет: запросы не авторизуются (AD-03).
- `db/app/` — 20 таблиц, 4 enum, журнал миграций.
- `.forge/progress.json` — 61 фича; изменяемое состояние — `../.forge/progress/<id>.json` в корне репозитория.

## Как вести дальше
Новая функциональность: сначала БР (новые FR/UJ/CAP с продолжением нумерации, без перенумерации), затем BE/FE, openapi и db, затем код. Расхождения кода и спеки — в `discrepancies.md`.
Статус: все 61 фича прошли forge-test-design и forge-qa (done). E2E: `npm run e2e` (нужен Chromium; путь можно задать `PW_CHROMIUM`). Контрактный тест: `core/test/contract.test.ts`.
