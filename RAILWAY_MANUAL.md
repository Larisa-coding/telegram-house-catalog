# Ручное подключение репозитория на Railway

## Способ 1: Создать проект и подключить через поиск

1. **Создайте пустой проект**:
   - Railway → "New Project"
   - Выберите **"Empty Project"** (НЕ "Deploy from GitHub repo")

2. **Добавьте GitHub сервис**:
   - В созданном проекте нажмите **"+ New"**
   - Выберите **"GitHub Repo"**
   - В поле поиска введите: `telegram-house-catalog`
   - Или: `Larisa-coding/telegram-house-catalog`
   - Нажмите Enter или выберите из результатов

3. **Если поиск не находит**:
   - Вставьте полный URL: `https://github.com/Larisa-coding/telegram-house-catalog`
   - Или используйте формат: `Larisa-coding/telegram-house-catalog`

## Способ 2: Использовать Railway CLI (надежнее)

```bash
# 1. Установите Railway CLI
npm install -g @railway/cli

# 2. Авторизуйтесь
railway login

# 3. Перейдите в папку проекта
cd "/Users/vladasmalioris/Desktop/уютный дом телега"

# 4. Создайте проект
railway init

# 5. Выберите "Empty Project" или "New Project"

# 6. Railway автоматически подключит текущий git репозиторий
```

## Способ 3: Подключить через Settings проекта

1. **Создайте пустой проект**:
   - Railway → "New Project" → "Empty Project"

2. **Перейдите в настройки**:
   - Проект → Settings → Source

3. **Подключите GitHub**:
   - Нажмите "Connect GitHub"
   - Введите: `Larisa-coding/telegram-house-catalog`
   - Или выберите из списка (если появится)

## Способ 4: Использовать Deploy Button (если есть)

Если в репозитории есть кнопка "Deploy on Railway":
- Нажмите на нее на странице GitHub репозитория
- Railway автоматически создаст проект

## После подключения репозитория:

1. **Railway автоматически определит Node.js проект**
2. **Настройте переменные окружения** (см. DEPLOY.md)
3. **Добавьте PostgreSQL базу данных**:
   - "+ New" → "Database" → "Add PostgreSQL"
   - Скопируйте `DATABASE_URL`

4. **Настройте Build и Start команды** (если нужно):
   - Settings → Deploy
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node server.js`

---

**Рекомендация**: Используйте **Способ 2 (Railway CLI)** - он самый надежный и автоматически подключит репозиторий.
