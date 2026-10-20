# VA Spec Maker

Локальный сервис для описания интентов, сущностей, промптов и сценариев голосового помощника с экспортом в DOCX (формат L3) и MD.

## Запуск

    npm install
    npm run dev      # разработка: фронтенд http://localhost:5173, API :3001
    npm run build    # сборка фронтенда в web/dist
    npm start        # всё на http://127.0.0.1:3001 (после build)

Данные: `data/spec.db` (SQLite). Копия файла = резервная копия.

## Тесты

    npm test
