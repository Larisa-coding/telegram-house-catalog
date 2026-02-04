# Инструкция по деплою на Railway

## Шаг 1: Деплой на GitHub

1. Инициализируйте git репозиторий:
```bash
cd "/Users/vladasmalioris/Desktop/уютный дом телега"
git init
git add .
git commit -m "Initial commit: Telegram House Catalog"
```

2. Создайте репозиторий на GitHub (larisa_coding):
   - Перейдите на https://github.com/new
   - Название: `telegram-house-catalog`
   - Создайте репозиторий

3. Подключите и запушьте:
```bash
git remote add origin https://github.com/larisa_coding/telegram-house-catalog.git
git branch -M main
git push -u origin main
```

## Шаг 2: Настройка Railway

1. Зайдите на https://railway.app
2. Нажмите "New Project"
3. Выберите "Deploy from GitHub repo"
4. Выберите репозиторий `larisa_coding/telegram-house-catalog`

## Шаг 3: Создание PostgreSQL базы данных

1. В проекте Railway нажмите "+ New"
2. Выберите "Database" → "Add PostgreSQL"
3. Railway автоматически создаст базу данных
4. Скопируйте `DATABASE_URL` из переменных окружения базы данных

## Шаг 4: Настройка переменных окружения

В настройках вашего сервиса Railway добавьте переменные:

```
DATABASE_URL=<скопируйте из PostgreSQL сервиса>
TELEGRAM_BOT_TOKEN=<ваш токен от BotFather>
TELEGRAM_CHANNEL_ID=@domuyut38
WEB_APP_URL=https://your-app-name.railway.app
CONTRACTOR_ID=9465
BASE_URL=https://строим.дом.рф
PORT=3000
NODE_ENV=production
```

## Шаг 5: Настройка Build и Start команд

Railway автоматически определит Node.js проект. Убедитесь, что:

**Build Command:**
```bash
cd backend && npm install
```

**Start Command:**
```bash
cd backend && node server.js
```

## Шаг 6: Настройка Telegram Bot

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot` и следуйте инструкциям
3. Скопируйте токен бота в переменную `TELEGRAM_BOT_TOKEN`
4. Настройте WebApp:
   ```
   /newapp
   [Выберите вашего бота]
   Название: Каталог уютных домов
   Описание: Каталог проектов домов от ИП Юрова
   Web App URL: https://your-app-name.railway.app
   ```

## Шаг 7: Тестирование парсера

После деплоя протестируйте парсер:

```bash
# Локально (если настроен .env):
cd backend
node test-parser.js

# Или через API после деплоя:
curl -X POST https://your-app-name.railway.app/api/parse/77279
```

## Шаг 8: Запуск Cron Job

Cron job запускается автоматически при старте сервера. Для отдельного запуска:

1. В Railway создайте отдельный сервис "Cron"
2. Start Command: `cd backend && node cron.js`
3. Или используйте встроенный cron в server.js (будет добавлен позже)

## Проверка работы

1. Откройте бота в Telegram: `/start`
2. Нажмите "Открыть каталог"
3. Проверьте API: `https://your-app-name.railway.app/health`
4. Проверьте проекты: `https://your-app-name.railway.app/api/projects`

## Troubleshooting

- Если база данных не создается: проверьте `DATABASE_URL`
- Если бот не отвечает: проверьте `TELEGRAM_BOT_TOKEN`
- Если парсер не работает: проверьте доступность сайта строим.дом.рф
- Логи: Railway → ваш сервис → Deployments → View Logs
