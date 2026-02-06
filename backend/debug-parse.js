/**
 * Скрипт для отладки парсера — проверь материал и планировки для конкретного проекта
 * Запуск: node backend/debug-parse.js 67335
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://строим.дом.рф';
const PROJECT_ID = process.argv[2] || '67335';

(async () => {
  console.log(`\n=== Отладка парсера для проекта ${PROJECT_ID} ===\n`);
  
  const url = `${BASE_URL}/project/${PROJECT_ID}`;
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 15000,
  });

  const $ = cheerio.load(html);

  // 1. МАТЕРИАЛ — что видит парсер
  console.log('--- МАТЕРИАЛ ---');
  const labelPattern = /Материал\s+(наружных\s+)?стен|Материал\s+стен/i;
  
  const contentItems = $('[class*="Content_general_item"], [class*="Content_general__item"]');
  console.log('Content_general_item найдено:', contentItems.length);
  contentItems.each((i, el) => {
    const ps = $(el).find('p');
    const label = ps.eq(0).text().trim();
    const value = ps.eq(1).text().trim();
    if (labelPattern.test(label)) {
      console.log('  ✓ Найден материал в Content_general:', `"${value}"`);
    }
  });

  const tableRows = $('[class*="Table_row"]').filter((i, el) => labelPattern.test($(el).text()));
  console.log('Table_row с "Материал стен" найдено:', tableRows.length);
  tableRows.each((i, el) => {
    const cols = $(el).find('[class*="Table_col"]');
    const val = cols.eq(1).text().trim();
    console.log('  ✓ Значение из Table_row:', `"${val}"`);
  });

  const bodyText = $('body').text();
  if (/Материал\s+стен|Материал\s+наружных/i.test(bodyText)) {
    console.log('  Текст "Материал стен" ЕСТЬ на странице');
  } else {
    console.log('  ⚠ Текст "Материал стен" НЕ найден на странице');
  }

  // 2. ПЛАНИРОВКИ — что видит парсер
  console.log('\n--- ПЛАНИРОВКИ ---');
  
  const planSection = $('[class*="PlanList_plan"], [class*="PlanList_plar"], [class*="PlanList"]');
  console.log('PlanList секций найдено:', planSection.length);
  
  const planImgs = $('img[alt*="План"], img[alt*="план"]').filter((i, el) => /этаж/i.test($(el).attr('alt') || ''));
  console.log('img с alt "План...этаж" найдено:', planImgs.length);
  planImgs.each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    console.log(`  img ${i + 1}: alt="${$(el).attr('alt')}" src=${src ? src.substring(0, 60) + '...' : 'НЕТ'}`);
  });

  const nextDataEl = $('script#__NEXT_DATA__');
  if (nextDataEl.length) {
    try {
      const nextData = JSON.parse(nextDataEl.html());
      const findPlans = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.projectPlans && Array.isArray(obj.projectPlans)) return obj;
        for (const k of Object.keys(obj)) {
          const r = findPlans(obj[k]);
          if (r) return r;
        }
        return null;
      };
      const proj = findPlans(nextData);
      if (proj?.projectPlans) {
        console.log('__NEXT_DATA__ projectPlans найдено:', proj.projectPlans.length);
        proj.projectPlans.forEach((p, i) => {
          const ids = p.imageFileIds || p.images || [];
          console.log(`  План ${i + 1}: imageFileIds=${ids.length}, ключи:`, Object.keys(p));
        });
      } else {
        console.log('  ⚠ __NEXT_DATA__ projectPlans НЕ найден');
        console.log('  Ключи в initialState:', Object.keys(nextData?.props?.pageProps?.initialState || {}));
      }
    } catch (e) {
      console.log('  ⚠ Ошибка парсинга __NEXT_DATA__:', e.message);
    }
  } else {
    console.log('  ⚠ script#__NEXT_DATA__ не найден');
  }

  // Вызов реального парсера
  const { parseProject, parseMaterial, parseFloorPlans } = require('./parser');
  const material = parseMaterial(html);
  const plans = parseFloorPlans(html);
  const full = await parseProject(PROJECT_ID, { skipContractorCheck: true });
  
  console.log('\n--- РЕЗУЛЬТАТ ПАРСЕРА ---');
  console.log('parseMaterial() вернул:', material ?? 'null');
  console.log('parseFloorPlans() вернул:', plans.length, 'URL');
  if (full) {
    console.log('material в projectData:', full.material ?? 'null');
    console.log('images всего:', full.images?.length ?? 0);
    console.log('images (планы в конце):', full.images?.slice(-5).map(u => u?.substring(0, 50) + '...') ?? []);
  }
  console.log('\n');
})().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
