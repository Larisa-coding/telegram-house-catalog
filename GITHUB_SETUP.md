# Инструкция по созданию репозитория на GitHub

## Шаг 1: Создайте репозиторий на GitHub

1. Перейдите на https://github.com/new
2. Войдите в аккаунт **larisa_coding**
3. Заполните форму:
   - **Repository name**: `telegram-house-catalog`
   - **Description**: `Telegram Mini App для каталога домов`
   - **Visibility**: Public или Private (на ваше усмотрение)
   - **НЕ** создавайте README, .gitignore или лицензию (они уже есть в проекте)
4. Нажмите **"Create repository"**

## Шаг 2: Обновите remote и запушьте код

После создания репозитория выполните:

```bash
# Удалите старый remote (если нужно)
git remote remove origin

# Добавьте новый remote
git remote add origin https://github.com/larisa_coding/telegram-house-catalog.git

# Проверьте remote
git remote -v

# Запушьте код
git push -u origin main
```

## Альтернатива: Если репозиторий уже существует с другим именем

Если вы хотите использовать существующий репозиторий:

```bash
# Удалите текущий remote
git remote remove origin

# Добавьте правильный URL вашего репозитория
git remote add origin https://github.com/larisa_coding/ВАШЕ_ИМЯ_РЕПОЗИТОРИЯ.git

# Запушьте
git push -u origin main
```

## Если возникнут проблемы с аутентификацией

GitHub больше не поддерживает пароли. Используйте:

1. **Personal Access Token**:
   - Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Создайте токен с правами `repo`
   - Используйте токен вместо пароля при push

2. **Или настройте SSH**:
   ```bash
   # Измените remote на SSH
   git remote set-url origin git@github.com:larisa_coding/telegram-house-catalog.git
   ```
