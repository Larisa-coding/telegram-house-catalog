# Простое подключение репозитория на Railway

## ✅ РАБОЧИЙ СПОСОБ

### Вариант 1: Через поиск (если репозиторий виден)

1. Откройте: **https://railway.app/new**
2. Нажмите: **"Deploy from GitHub repo"**
3. В поле поиска введите: `telegram-house-catalog`
4. Если не находит, попробуйте: `Larisa-coding/telegram-house-catalog`
5. Выберите репозиторий из списка

### Вариант 2: Создать проект вручную (если поиск не работает)

1. Откройте: **https://railway.app/new**
2. Выберите: **"Empty Project"**
3. В созданном проекте нажмите: **"+ New"**
4. Выберите: **"GitHub Repo"**
5. В поле вставьте: `Larisa-coding/telegram-house-catalog`
6. Или полный URL: `https://github.com/Larisa-coding/telegram-house-catalog`
7. Нажмите Enter или кнопку подключения

### Вариант 3: Через Settings проекта

1. Создайте **"Empty Project"**
2. Перейдите в проект → **Settings** → **Source**
3. Нажмите **"Connect GitHub"** или **"Link Repository"**
4. Введите: `telegram-house-catalog`
5. Или: `Larisa-coding/telegram-house-catalog`

---

**Важно**: После подключения Railway автоматически определит Node.js проект и начнет деплой.

Если деплой упадет с ошибкой - это нормально, нужно будет настроить переменные окружения (см. DEPLOY.md).
