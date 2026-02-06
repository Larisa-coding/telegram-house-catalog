# Настройка Railway - Подключение GitHub репозитория

## Проблема: Репозиторий не появляется на Railway

### Решение 1: Авторизация через GitHub

1. **Войдите в Railway**:
   - Откройте https://railway.app
   - Нажмите "Login" или "Start a New Project"

2. **Авторизуйтесь через GitHub**:
   - Выберите "Login with GitHub"
   - Разрешите Railway доступ к вашим репозиториям
   - Убедитесь, что вы авторизованы как **Larisa-coding**

3. **Проверьте доступ к репозиториям**:
   - Railway → Settings → GitHub
   - Убедитесь, что репозиторий `telegram-house-catalog` виден в списке

### Решение 2: Ручное подключение репозитория

Если репозиторий все еще не виден:

1. **Создайте новый проект**:
   - Railway → "New Project"
   - Выберите "Empty Project" (не "Deploy from GitHub repo")

2. **Добавьте сервис**:
   - В проекте нажмите "+ New"
   - Выберите "GitHub Repo"
   - Введите URL репозитория: `Larisa-coding/telegram-house-catalog`
   - Или вставьте полный URL: `https://github.com/Larisa-coding/telegram-house-catalog`

### Решение 3: Проверка прав доступа

1. **Проверьте, что репозиторий публичный** (или Railway имеет доступ):
   - GitHub → Settings → Applications → Authorized OAuth Apps
   - Найдите "Railway" и проверьте права доступа

2. **Если репозиторий приватный**:
   - Railway должен иметь доступ к приватным репозиториям
   - Проверьте настройки в GitHub: Settings → Applications → Railway → Permissions

### Решение 4: Альтернативный способ - Deploy через GitHub

1. **Создайте проект вручную**:
   - Railway → "New Project" → "Empty Project"

2. **Добавьте сервис**:
   - "+ New" → "GitHub Repo"
   - В поиске введите: `telegram-house-catalog`
   - Выберите репозиторий из списка

3. **Или используйте Deploy Button**:
   - Railway автоматически определит репозиторий при первом деплое

### Решение 5: Проверка имени репозитория

Убедитесь, что:
- Репозиторий существует: https://github.com/Larisa-coding/telegram-house-catalog
- Вы авторизованы в Railway под правильным GitHub аккаунтом
- Репозиторий не в архиве

### Если ничего не помогает:

1. **Создайте проект вручную**:
   ```bash
   # Railway → New Project → Empty Project
   ```

2. **Подключите GitHub позже**:
   - В настройках проекта → Source → Connect GitHub
   - Выберите репозиторий из списка

3. **Или используйте Railway CLI**:
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway link
   ```

---

**Важно**: После подключения репозитория Railway автоматически начнет деплой при каждом push в main ветку.
