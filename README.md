# Telegram Mini App - Каталог уютных домов

Полнофункциональное приложение для каталога домов с парсингом данных с сайта строим.дом.рф.

## Структура проекта

```
telegram-house-catalog/
├── backend/
│   ├── server.js          # Express сервер
│   ├── parser.js          # Парсер проектов
│   ├── cron.js            # Cron job для проверки новых проектов
│   ├── bot.js             # Telegram Bot
│   ├── db.js              # PostgreSQL подключение
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── manifest.json
├── railway.json
└── README.md
```

## Установка и настройка

### 1. Локальная разработка

```bash
cd backend
npm install
cp .env.example .env
# Заполните .env файл
npm start
```

### 2. Railway Deployment

1. Создайте новый проект на Railway
2. Добавьте PostgreSQL базу данных
3. Добавьте переменные окружения:
   - `DATABASE_URL` - из Railway PostgreSQL
   - `TELEGRAM_BOT_TOKEN` - токен бота от BotFather
   - `TELEGRAM_CHANNEL_ID` - ID канала (например, @domuyut38)
   - `WEB_APP_URL` - URL вашего приложения на Railway
   - `CONTRACTOR_ID=9465`
   - `BASE_URL=https://строим.дом.рф`

4. Подключите GitHub репозиторий
5. Railway автоматически задеплоит приложение

### 3. Настройка Telegram Bot

1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Получите токен бота
3. Настройте WebApp:
   ```
   /newapp
   Выберите бота
   Название: Каталог домов
   Описание: Каталог проектов домов
   Фото: (опционально)
   Web App URL: https://your-app.railway.app
   ```

### 4. Инициализация базы данных

База данных создастся автоматически при первом запуске сервера.

## API Endpoints

- `GET /api/projects` - список проектов с фильтрами
- `GET /api/projects/:id` - детальная информация о проекте
- `POST /api/parse/:id` - парсинг проекта по ID
- `GET /api/materials` - список уникальных материалов

## Cron Job

Cron job запускается каждые 2 часа и проверяет новые проекты от подрядчика с ID 9465.

Для запуска cron отдельно:
```bash
cd backend
node cron.js
```

## Особенности

- Автоматический парсинг проектов с проверкой подрядчика
- Автопостинг новых проектов в Telegram канал
- Фильтрация по материалу, площади, поиск
- Responsive дизайн для мобильных устройств
- Интеграция с Telegram WebApp API
