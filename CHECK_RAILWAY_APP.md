# Проверка Railway App на GitHub

## Репозиторий существует ✅

Проверено:
- URL: https://github.com/Larisa-coding/telegram-house-catalog
- Ветка main доступна
- Репозиторий публичный

## Проблема: Railway не видит репозиторий

Это проблема синхронизации Railway App с GitHub.

## ✅ РЕШЕНИЕ: Проверьте Railway App на GitHub

1. **Откройте настройки GitHub**:
   - GitHub → Ваш профиль (правый верхний угол) → **Settings**
   - Или: https://github.com/settings/applications

2. **Найдите Railway App**:
   - В левом меню выберите **"Applications"** → **"Installed GitHub Apps"**
   - Или перейдите: https://github.com/settings/installations

3. **Найдите "Railway"** в списке установленных приложений

4. **Нажмите "Configure"** рядом с Railway

5. **Проверьте настройки доступа**:
   - **Repository access**: Должно быть "All repositories" или конкретно выбран `telegram-house-catalog`
   - Если выбрано "Only select repositories", убедитесь, что `telegram-house-catalog` в списке
   - **Permissions**: Должны быть права на чтение репозиториев

6. **Сохраните изменения**

7. **Вернитесь в Railway**:
   - Обновите страницу (F5)
   - Railway → "New Project" → "Deploy from GitHub repo"
   - Репозиторий должен появиться в списке

## Альтернатива: Переустановить Railway App

Если не помогло:

1. В настройках Railway App на GitHub нажмите **"Uninstall"**
2. В Railway → Settings → Account → GitHub нажмите **"Disconnect"**
3. Подключите GitHub заново в Railway
4. При подключении разрешите доступ ко всем репозиториям

---

**Важно**: После изменения настроек Railway App на GitHub подождите 1-2 минуты для синхронизации.
