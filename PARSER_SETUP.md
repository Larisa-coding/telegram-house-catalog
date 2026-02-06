# Настройка парсера для массового парсинга проектов

## Запуск массового парсинга

После деплоя на Railway нужно запустить массовый парсинг всех проектов с сайта строим.дом.рф.

### Способ 1: Через API endpoint (POST запрос)

**Важно**: Это POST endpoint, не GET! Используй один из способов ниже:

#### Вариант A: Через curl (рекомендуется)

**Автоматический режим (начинает с 45):**
```bash
curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
  -H "Content-Type: application/json" \
  -d '{}'
```

**С указанием диапазона:**
```bash
curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
  -H "Content-Type: application/json" \
  -d '{"startId": 45, "endId": 500}'
```

#### Вариант B: Через Postman или другой API клиент
- Метод: **POST**
- URL: `https://telegram-house-catalog-production.up.railway.app/api/parse-batch`
- Headers: `Content-Type: application/json`
- Body (JSON):

**Вариант 1: Указать диапазон вручную**
```json
{
  "startId": 45,
  "endId": 500
}
```

**Вариант 2: Автоматический поиск (без указания диапазона)**
```json
{}
```
Парсер автоматически начнет с ID 45 и проверит следующие 1000 проектов, или продолжит с последнего найденного ID.

Или через curl:
```bash
# С указанием диапазона
curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
  -H "Content-Type: application/json" \
  -d '{"startId": 45, "endId": 500}'

# Автоматический поиск (без диапазона)
curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Способ 2: Через Railway CLI или терминал

Если есть доступ к Railway терминалу, можно запустить напрямую через Node.js.

## Параметры

- `startId` - начальный ID проекта (опционально, если не указан - начинается с 45 или продолжает с последнего найденного)
- `endId` - конечный ID проекта (опционально, если не указан - проверяет следующие 1000 проектов)
- `step` - шаг проверки (по умолчанию 1, можно указать для пропуска ID)

## Рекомендации

1. **Первый запуск (рекомендуется)**: Автоматический режим - парсер проверит очень широкий диапазон
   ```bash
   curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   Парсер автоматически:
   - Начнет с ID 45 (если БД пустая)
   - Проверит до 100,000 ID (или до последнего найденного + 1000)
   - Остановится если 100 подряд проектов не найдено

2. **Для проверки конкретного диапазона**: Укажи startId и endId
   ```bash
   curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
     -H "Content-Type: application/json" \
     -d '{"startId": 40000, "endId": 70000}'
   ```

3. **Для проверки очень широкого диапазона**: Укажи большой endId
   ```bash
   curl -X POST https://telegram-house-catalog-production.up.railway.app/api/parse-batch \
     -H "Content-Type: application/json" \
     -d '{"startId": 45, "endId": 100000}'
   ```

3. **Проверяй логи** Railway на ошибки
4. **После парсинга** проверь каталог в приложении
5. **ID проектов могут быть разными** - парсер автоматически пропустит несуществующие

## Автоматическая проверка новых проектов

Cron job настроен на автоматическую проверку каждые 2 часа. Он проверяет проекты после последнего найденного ID.

Для ручного запуска cron:
```bash
POST https://telegram-house-catalog-production.up.railway.app/api/cron/check
```

(Нужно добавить этот endpoint если его нет)
