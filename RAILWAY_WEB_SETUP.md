# Подключение репозитория через веб-интерфейс Railway

## Пошаговая инструкция

### Шаг 1: Создайте пустой проект

1. Откройте https://railway.app
2. Нажмите **"New Project"**
3. Выберите **"Empty Project"** (НЕ "Deploy from GitHub repo")

### Шаг 2: Добавьте GitHub сервис

1. В созданном проекте нажмите **"+ New"** (или кнопку "+" вверху)
2. В меню выберите **"GitHub Repo"**
3. Появится поле поиска

### Шаг 3: Подключите репозиторий

**Вариант A: Поиск по имени**
- В поле поиска введите: `telegram-house-catalog`
- Нажмите Enter
- Если не находит, попробуйте: `Larisa-coding/telegram-house-catalog`

**Вариант B: Прямой URL**
- Вставьте полный URL: `https://github.com/Larisa-coding/telegram-house-catalog`
- Или формат: `Larisa-coding/telegram-house-catalog`

**Вариант C: Если есть кнопка "Connect"**
- Нажмите "Connect GitHub" или "Link Repository"
- Введите имя: `telegram-house-catalog`
- Или выберите из списка (если появится)

### Шаг 4: Railway автоматически определит проект

После подключения Railway:
- Автоматически определит Node.js проект
- Начнет деплой (может быть ошибка, это нормально - нужно настроить переменные)

### Шаг 5: Настройте переменные окружения

1. В проекте нажмите на ваш сервис (GitHub Repo)
2. Перейдите в **"Variables"** (или "Settings" → "Variables")
3. Добавьте переменные:
   ```
   DATABASE_URL=<будет добавлен после создания БД>
   TELEGRAM_BOT_TOKEN=<ваш токен>
   TELEGRAM_CHANNEL_ID=@domuyut38
   WEB_APP_URL=https://your-app.railway.app
   CONTRACTOR_ID=9465
   BASE_URL=https://строим.дом.рф
   PORT=3000
   NODE_ENV=production
   ```

### Шаг 6: Добавьте PostgreSQL базу данных

1. В проекте нажмите **"+ New"**
2. Выберите **"Database"** → **"Add PostgreSQL"**
3. Railway создаст базу данных
4. Скопируйте `DATABASE_URL` из переменных окружения БД
5. Вставьте в переменные вашего сервиса (замените `<будет добавлен после создания БД>`)

### Шаг 7: Настройте Build и Start команды (если нужно)

1. Сервис → **"Settings"** → **"Deploy"**
2. **Build Command**: `cd backend && npm install`
3. **Start Command**: `cd backend && node server.js`
4. Сохраните

### Шаг 8: Проверьте деплой

1. Railway автоматически перезапустит деплой
2. Проверьте логи: **"Deployments"** → выберите последний деплой → **"View Logs"**
3. Дождитесь успешного деплоя

---

**Важно**: Если репозиторий все еще не находится через поиск, попробуйте:
- Обновить страницу Railway
- Выйти и войти заново в Railway
- Проверить, что репозиторий точно существует: https://github.com/Larisa-coding/telegram-house-catalog
