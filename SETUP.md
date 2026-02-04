# Быстрая настройка проекта

## Локальная разработка

### 1. Установка зависимостей

```bash
cd backend
npm install
```

### 2. Настройка .env

Скопируйте `.env.example` в `.env` и заполните:

```bash
cp .env.example .env
```

Заполните переменные:
- `DATABASE_URL` - для локальной разработки используйте локальный PostgreSQL или Railway
- `TELEGRAM_BOT_TOKEN` - получите у @BotFather
- Остальные переменные можно оставить по умолчанию

### 3. Запуск сервера

```bash
npm start
# или для разработки с автоперезагрузкой:
npm run dev
```

### 4. Тестирование парсера

```bash
npm run test-parser
# или
node test-parser.js
```

## Структура проекта

```
telegram-house-catalog/
├── backend/              # Node.js сервер
│   ├── server.js        # Express сервер + API
│   ├── parser.js        # Парсер строим.дом.рф
│   ├── cron.js          # Cron job для проверки новых проектов
│   ├── bot.js           # Telegram Bot
│   ├── db.js            # PostgreSQL подключение
│   └── test-parser.js   # Тестовый скрипт парсера
├── frontend/            # Telegram WebApp
│   ├── index.html       # Главная страница
│   ├── style.css        # Стили
│   ├── script.js        # Логика приложения
│   └── manifest.json    # Web App манифест
└── railway.json         # Конфигурация Railway
```

## API Endpoints

- `GET /api/projects` - список проектов
  - Query params: `material`, `minArea`, `maxArea`, `search`, `limit`, `offset`
- `GET /api/projects/:id` - детали проекта
- `POST /api/parse/:id` - парсинг проекта (например: `/api/parse/77279`)
- `GET /api/materials` - список материалов для фильтров
- `GET /health` - проверка здоровья сервера

## Тестирование проекта 77279

После настройки базы данных и запуска сервера:

```bash
# Парсинг проекта
curl -X POST http://localhost:3000/api/parse/77279

# Получение всех проектов
curl http://localhost:3000/api/projects

# Получение материалов
curl http://localhost:3000/api/materials
```

## Следующие шаги

1. ✅ Создать структуру проекта
2. ✅ Настроить парсер для проекта 77279
3. ⏳ Задеплоить на GitHub (larisa_coding)
4. ⏳ Настроить Railway проект
5. ⏳ Создать PostgreSQL базу данных
6. ⏳ Настроить переменные окружения
7. ⏳ Протестировать парсер на Railway
8. ⏳ Настроить Telegram Bot
9. ⏳ Настроить автопостинг в канал
10. ⏳ Настроить cron job
