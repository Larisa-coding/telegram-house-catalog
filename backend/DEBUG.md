# Отладка парсера — где искать ошибки

## Запуск отладки
```bash
node backend/debug-parse.js 67335
```
Замени `67335` на ID проблемного проекта.

---

## 1. МАТЕРИАЛ не парсится (material = null)

**Файл:** `backend/parser.js` → функция `parseMaterial(html)`

**Что проверяет отладка:**
- `Content_general_item` — плашка "Материал стен". Значение "—" игнорируется.
- `Table_row` — строка "Материал наружных стен". Вторая колонка (Table_col) может быть пустой в HTML.
- Селекторы: `[class*="ValueWithHint"]`, `p[data-testid="typography"]`.

**Если material = null:**
1. Открой страницу проекта в браузере, DevTools → Elements.
2. Найди блок с "Материал наружных стен" / "Материал стен".
3. Посмотри точную структуру: классы, data-атрибуты, где лежит значение ("Пиленый брус" и т.п.).
4. Добавь новый селектор в `parseMaterial` под пункты 1–6.

---

## 2. ПЛАНИРОВКИ не добавляются

**Файл:** `backend/parser.js` → функция `parseFloorPlans(html)`

**Источники (по порядку):**
1. Секция `PlanList_plan` — img внутри
2. `swiper-slide` img с alt "План...этаж" или resizer URL
3. `img[alt*="План"]` с "этаж"
4. `__NEXT_DATA__.projectPlans.imageFileIds` — fallback

**Если plans = []:**
- Отладка покажет: "PlanList секций найдено", "img с alt План...этаж", "__NEXT_DATA__ projectPlans".
- Если `__NEXT_DATA__ projectPlans` есть, но plans пустой — формат `imageFileIds` или URL мог измениться.

**Важно:** после правок парсера нажми **«Обновить все проекты»** в админке — иначе старые данные в БД не обновятся.

---

## 3. Фото планировок не отображаются во фронте

**Файл:** `frontend/script.js`

- `getFirstHouseImage()` исключает floor plans (`isFloorPlan`), поэтому главное фото — только дом.
- Планировки должны быть в `otherImages` и показываться в модалке под главным фото.
- Проверь `project.images` в Network/ответе API — есть ли в массиве URL планировок.
