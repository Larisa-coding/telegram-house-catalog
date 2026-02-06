# Настройка парсера для массового парсинга проектов

## Запуск массового парсинга

После деплоя на Railway нужно запустить массовый парсинг всех проектов с сайта строим.дом.рф.

### Способ 1: Через API endpoint (POST запрос)

**Важно**: Это POST endpoint, не GET! Используй один из способов ниже:

#### Вариант A: Через curl (рекомендуется)
```bash
curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
  -H "Content-Type: application/json" \
  -d '{"startId": 77000, "endId": 77200}'
```

#### Вариант B: Через Postman или другой API клиент
- Метод: **POST**
- URL: `https://telegram-house-catalog-production.up.railway.app/api/parse-batch`
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "startId": 77000,
  "endId": 78000
}
```

Или через curl:
```bash
curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
  -H "Content-Type: application/json" \
  -d '{"startId": 77000, "endId": 78000}'
```

### Способ 2: Через Railway CLI или терминал

Если есть доступ к Railway терминалу, можно запустить напрямую через Node.js.

## Параметры

- `startId` - начальный ID проекта (по умолчанию 77000)
- `endId` - конечный ID проекта (по умолчанию 78000)
- `contractorId` - ID подрядчика (по умолчанию 9465, проверяется автоматически)

## Рекомендации

1. **Начни с небольшого диапазона** (например, 77000-77100) для проверки
2. **Увеличивай постепенно** (100-200 проектов за раз)
3. **Проверяй логи** Railway на ошибки
4. **После парсинга** проверь каталог в приложении

## Автоматическая проверка новых проектов

Cron job настроен на автоматическую проверку каждые 2 часа. Он проверяет проекты после последнего найденного ID.

Для ручного запуска cron:
```bash
POST https://telegram-house-catalog-production.up.railway.app/api/cron/check
```

(Нужно добавить этот endpoint если его нет)
