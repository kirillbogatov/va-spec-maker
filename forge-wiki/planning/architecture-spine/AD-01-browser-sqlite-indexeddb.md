---
id: AD-01
slug: 'browser-sqlite-indexeddb'
status: adopted
binds: [all]
---

# AD-01 — Данные проекта хранятся в SQLite (sql.js, WASM) внутри браузера [ADOPTED]

- **Decision:** Данные проекта хранятся в SQLite (sql.js, WASM) внутри браузера; база целиком сериализуется в IndexedDB после каждой записи (с задержкой).
- **Binds:** all.
- **Prevents:** сервер или внешнюю базу данных.
- **Rule:** Серверов, синхронизации и обмена данными с внешними сервисами нет; схема БД описана в db/app; миграции выполняются при открытии базы по PRAGMA user_version.
