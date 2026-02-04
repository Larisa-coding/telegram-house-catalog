#!/bin/bash

# Скрипт для деплоя на GitHub

echo "🚀 Начинаем деплой на GitHub..."

# Проверка git
if ! command -v git &> /dev/null; then
    echo "❌ Git не установлен. Установите Git и попробуйте снова."
    exit 1
fi

# Инициализация git (если еще не инициализирован)
if [ ! -d ".git" ]; then
    echo "📦 Инициализация git репозитория..."
    git init
    git branch -M main
fi

# Добавление всех файлов
echo "📝 Добавление файлов..."
git add .

# Коммит
echo "💾 Создание коммита..."
git commit -m "Initial commit: Telegram House Catalog - Full stack app with parser"

# Проверка remote
if ! git remote | grep -q "origin"; then
    echo "🔗 Добавление remote origin..."
    echo "Введите URL вашего GitHub репозитория (например: https://github.com/larisa_coding/telegram-house-catalog.git):"
    read REPO_URL
    git remote add origin "$REPO_URL"
fi

# Push
echo "⬆️  Отправка на GitHub..."
git push -u origin main

echo "✅ Деплой завершен!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Перейдите на Railway.app"
echo "2. Создайте новый проект"
echo "3. Подключите GitHub репозиторий"
echo "4. Создайте PostgreSQL базу данных"
echo "5. Настройте переменные окружения (см. DEPLOY.md)"
echo ""
echo "📖 Подробные инструкции в файле DEPLOY.md"
