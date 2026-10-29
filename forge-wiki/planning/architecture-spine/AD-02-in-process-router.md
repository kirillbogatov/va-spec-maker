---
id: AD-02
slug: 'in-process-router'
status: adopted
binds: [all]
---

# AD-02 — Запросы клиента обрабатывает собственный роутер ядра в браузере (createApp().handle) без HTTP [ADOPTED]

- **Decision:** Запросы клиента обрабатывает собственный роутер ядра в браузере (createApp().handle) без HTTP; контракт описан в OpenAPI как обычный REST.
- **Binds:** all.
- **Prevents:** расхождение между контрактом и поведением роутера.
- **Rule:** Адрес начинается с /api; ошибки возвращаются как {error, message, details}, где error — код в нижнем регистре (bad_request, not_found, duplicate, in_use, internal), а в реестре openapi/app/errors это BadRequestError, NotFoundError, DuplicateError, InUseError, InternalError.
