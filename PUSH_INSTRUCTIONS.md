# Инструкция по push на GitHub

## ✅ Коммит уже создан!

Теперь нужно:

### 1. Обновите remote URL (обратите внимание на заглавную C в Coding):

```bash
git remote set-url origin https://github.com/Larisa-coding/telegram-house-catalog.git
```

### 2. Проверьте remote:

```bash
git remote -v
```

Должно показать:
```
origin  https://github.com/Larisa-coding/telegram-house-catalog.git (fetch)
origin  https://github.com/Larisa-coding/telegram-house-catalog.git (push)
```

### 3. Запушьте код:

```bash
git push -u origin main
```

### 4. Если потребуется аутентификация:

GitHub не принимает пароли. Используйте **Personal Access Token**:

1. Перейдите: https://github.com/settings/tokens
2. Нажмите "Generate new token" → "Generate new token (classic)"
3. Название: `telegram-house-catalog`
4. Выберите права: `repo` (все галочки в разделе repo)
5. Нажмите "Generate token"
6. **Скопируйте токен** (он показывается только один раз!)
7. При push используйте:
   - Username: `Larisa-coding`
   - Password: **вставьте токен** (не пароль от GitHub!)

### Альтернатива: Использовать SSH

Если настроен SSH ключ:

```bash
git remote set-url origin git@github.com:Larisa-coding/telegram-house-catalog.git
git push -u origin main
```

---

После успешного push переходите к настройке Railway (см. DEPLOY.md, Шаг 2)
