const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const CONTRACTOR_ID = process.env.CONTRACTOR_ID || '9465';
const BASE_URL = process.env.BASE_URL || 'https://строим.дом.рф';

/**
 * Парсит страницу проекта с строим.дом.рф.
 * @param {string|number} projectId - ID проекта на строим.дом.рф
 * @param {{ skipContractorCheck?: boolean }} options - skipContractorCheck: true при ручном добавлении по ID (любой проект)
 */
const parseProject = async (projectId, options = {}) => {
  const skipContractorCheck = options.skipContractorCheck === true;
  try {
    const url = `${BASE_URL}/project/${projectId}`;
    console.log(`Parsing project: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const pageText = $('body').text();

    if (!skipContractorCheck) {
      const contractorId = $('[data-contractor-id]').attr('data-contractor-id') || 
                           $('.contractor-id').text().trim() ||
                           $('[data-id]').filter((i, el) => $(el).text().includes('9465')).attr('data-id');
      const hasContractor = pageText.includes('9465') || 
                           pageText.includes('Юрова Любовь Владимировна') ||
                           $('a[href*="contractor/9465"]').length > 0;
      if (!hasContractor && contractorId !== CONTRACTOR_ID) {
        console.log(`Project ${projectId} is not from contractor ${CONTRACTOR_ID}`);
        return null;
      }
    }

    // Извлечение данных
    const name = $('h1').first().text().trim() || 
                 $('.project-title').text().trim() ||
                 $('[class*="title"]').first().text().trim();

    // Площадь дома (ищем "Площадь дома" или "Площадь")
    let area = null;
    // Ищем в структурированных данных
    $('*').each((i, el) => {
      const text = $(el).text();
      // Ищем "Площадь дома" с числом
      const match = text.match(/Площадь\s+дома[:\s]+(\d+[,.]?\d*)\s*м[²2]/i) ||
                    text.match(/(\d+[,.]?\d*)\s*м[²2]/i);
      if (match && !area) {
        area = parseFloat(match[1].replace(',', '.'));
      }
    });

    // Цена (ищем "от X ₽")
    let price = null;
    $('*').each((i, el) => {
      const text = $(el).text();
      // Ищем "от X ₽" или просто "X ₽"
      const match = text.match(/от\s+(\d[\d\s]*)\s*₽/i) ||
                    text.match(/(\d[\d\s]*)\s*₽/);
      if (match && !price) {
        price = parseFloat(match[1].replace(/\s/g, '').replace(',', ''));
      }
    });

    // Материал — ТОЛЬКО брус или газобетон, строго по данным сайта
    let material = null;
    const bodyText = $('body').text();

    const extractMaterial = () => {
      const setFromVal = (val) => {
        const v = String(val).toLowerCase();
        if (/газобетон|газоблок|газоблочный/.test(v)) { material = 'газобетон'; return true; }
        if (/\bбрус\b|клееный брус|профилированный брус/.test(v)) { material = 'брус'; return true; }
        return false;
      };

      // 1. dt/dd: <dt>Материал наружных стен</dt><dd>Газобетон</dd> — берём только значение dd
      $('dt').each((i, el) => {
        if (/Материал\s+(наружных\s+)?стен|Материал\s+стен/i.test($(el).text())) {
          const next = $(el).next('dd');
          if (next.length && setFromVal(next.text().trim())) return false;
        }
      });
      if (material) return;

      // 2. Таблица: td с "Материал" — соседняя ячейка в той же строке
      $('td, th').each((i, el) => {
        const $el = $(el);
        if (/Материал\s+(наружных\s+)?стен|Материал\s+стен/i.test($el.text().trim()) && $el.text().trim().length < 50) {
          const $row = $el.closest('tr');
          const idx = $row.children().index($el);
          const $next = $row.children().eq(idx + 1);
          if ($next.length && setFromVal($next.text().trim())) return false;
        }
      });
      if (material) return;

      // 3. Контекст "Материал наружных стен: XXX" — только ближайшие 80 символов
      const near = bodyText.match(/Материал\s+наружных\s+стен\s*[:\s]*([а-яёА-ЯЁ\s\-]+?)(?:\n|$|Площадь|Спальни|м²)/i);
      if (near && setFromVal(near[1])) return;

      // 4. [class*="value"] рядом с "Материал"
      $('[class*="param"], [class*="characteristic"], [class*="spec"]').each((i, el) => {
        const txt = $(el).text();
        if (/Материал\s+(наружных\s+)?стен|Материал\s+стен/i.test(txt) && txt.length < 200) {
          const $val = $(el).find('[class*="value"]');
          if ($val.length && setFromVal($val.first().text())) return false;
          const val = txt.replace(/Материал\s+(наружных\s+)?стен\s*[:\s]*/gi, '').trim().split(/\s/)[0];
          if (val && setFromVal(val)) return false;
        }
      });

      // 5. Fallback: поиск по тексту страницы — приоритет газобетона, если оба
      const nearMaterial = bodyText.match(/Материал\s+наружных\s+стен[^]*?([а-яёА-ЯЁ\-]+)/i);
      if (nearMaterial && setFromVal(nearMaterial[1])) return;
      if (/газобетон|газоблок|газоблочный/i.test(bodyText)) material = 'газобетон';
      else if (/\bбрус\b|клееный брус|профилированный брус/i.test(bodyText)) material = 'брус';
    };

    extractMaterial();

    // Количество спален (ищем в разделе "Объемно-планировочные решения")
    let bedrooms = null;
    $('*').each((i, el) => {
      const text = $(el).text();
      // Ищем "Спальни: X" или "Спальни\nX"
      const match = text.match(/Спальни[:\s]+(\d+)/i);
      if (match && !bedrooms) {
        bedrooms = parseInt(match[1]);
      }
    });

    // Характеристики (ищем в разделе "Объемно-планировочные решения")
    const bodyTextLower = bodyText.toLowerCase();
    const hasKitchenLiving = bodyTextLower.includes('совмещенная кухня-гостиная') || 
                            bodyTextLower.includes('кухня-гостиная') ||
                            bodyTextLower.includes('кухня гостиная');
    const hasGarage = bodyTextLower.includes('пристроенный гараж') ||
                     bodyTextLower.includes('крытая автостоянка') ||
                     bodyTextLower.includes('гараж');
    const hasSecondFloor = bodyText.match(/Количество надземных этажей[:\s]+2/i) ||
                          bodyTextLower.includes('2 этаж') || 
                          bodyTextLower.includes('второй этаж') ||
                          bodyTextLower.includes('двухэтажный');
    const hasTerrace = bodyTextLower.includes('терраса') || 
                      bodyTextLower.includes('веранда');

    // Описание
    const description = $('.description').text().trim() ||
                       $('[class*="description"]').text().trim() ||
                       $('p').first().text().trim() ||
                       '';

    const isLogoOrIcon = (url) => {
      if (!url) return true;
      const lower = url.toLowerCase();
      return /logo|favicon|icon|emblem|brand|header|nav|avatar|sprite|banner|button|contractor|catalogue|katalog|placeholder|default|noimage|watermark|nophoto|no-photo/.test(lower) ||
        /\/icons?\/|\/logo\/|\/contractor\/|logo\.(png|svg|jpg|jpeg|gif)|favicon\./.test(lower);
    };

    const isFloorPlan = (url) => {
      if (!url || typeof url !== 'string') return false;
      const lower = url.toLowerCase();
      return /plan|планир|этаж|floor|layout|чертеж|схема/i.test(lower);
    };

    const isInLogoArea = (el) => {
      if (!el) return false;
      const $el = $(el);
      const $parent = $el.closest('[class*="header"], [class*="nav"], [class*="logo"], [class*="brand"], [id*="header"], [id*="logo"], [class*="contractor"]');
      if ($parent.length) return true;
      const alt = ($el.attr('alt') || '').toLowerCase();
      const title = ($el.attr('title') || '').toLowerCase();
      return /уютн|каталог|логотип|logo/.test(alt) || /уютн|каталог|логотип|logo/.test(title);
    };

    const seen = new Set();
    const housePhotos = [];
    const floorPlans = [];

    const addTo = (arr, src, max, el) => {
      if (!src || seen.has(src) || isLogoOrIcon(src) || (el && isInLogoArea(el)) || arr.length >= max) return;
      if (!src.startsWith('http')) {
        src = src.startsWith('//') ? `https:${src}` : `${BASE_URL}${src}`;
      }
      seen.add(src);
      arr.push(src);
    };

    // 1. Галерея, слайдер, карусель — основные фото домов
    $('[class*="gallery"], [class*="slider"], [class*="carousel"], [class*="project-gallery"], [class*="project"] img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-srcset')?.split(' ')[0];
      if (src && !isFloorPlan(src)) addTo(housePhotos, src, 25, el);
    });

    // 2. Все img с /upload/, project, house, dom — fallback
    if (housePhotos.length < 6) {
      $('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src && (src.includes('/upload/') || src.includes('project') || src.includes('house') || src.includes('/dom/') || src.includes('iblock')) && !isFloorPlan(src)) {
          addTo(housePhotos, src, 25, el);
        }
      });
    }

    // 3. Любые img с http (кроме логотипов по URL)
    if (housePhotos.length < 3) {
      $('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && src.includes('http') && !isFloorPlan(src)) addTo(housePhotos, src, 25, el);
      });
    }

    // 4. ПОЭТАЖНЫЙ ПЛАН — ищем секцию и берём ВСЕ планировки
    const planKeywords = ['поэтажный план', 'планировка', 'план этажа', 'планы этажей'];
    let $planRoot = null;
    $('div, section, [class*="plan"], [class*="floor"], [class*="layout"], [class*="планир"]').each((i, el) => {
      const text = $(el).text().toLowerCase();
      const hasPlan = planKeywords.some((k) => text.includes(k));
      const imgCount = $(el).find('img').length;
      if (hasPlan && imgCount >= 1 && !$planRoot) {
        $planRoot = $(el).first();
        return false;
      }
    });
    if ($planRoot && $planRoot.length) {
      $planRoot.find('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src) addTo(floorPlans, src, 25, el);
      });
    }

    // 5. Дополнительно: img с plan/планир/этаж в src или alt
    $('img[src*="plan"], img[src*="планир"], img[src*="этаж"], img[alt*="план"], img[alt*="этаж"]').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src) addTo(floorPlans, src, 25, el);
    });
    $('[class*="plan"], [class*="floor"], [class*="layout"], [class*="планиров"] img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && isFloorPlan(src)) addTo(floorPlans, src, 25, el);
    });

    const images = [...housePhotos, ...floorPlans].slice(0, 50);

    const projectData = {
      project_id: parseInt(projectId),
      name: name || `Проект ${projectId}`,
      area: area,
      material: material,
      price: price,
      bedrooms: bedrooms,
      has_kitchen_living: hasKitchenLiving,
      has_garage: hasGarage,
      has_second_floor: hasSecondFloor,
      has_terrace: hasTerrace,
      description: description || '',
      images: images,
      url: url,
    };

    console.log(`Successfully parsed project ${projectId}:`, projectData);
    return projectData;

  } catch (error) {
    console.error(`Error parsing project ${projectId}:`, error.message);
    return null;
  }
};

const declenseBedroom = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} спальня`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} спальни`;
  return `${n} спален`;
};

/**
 * Генерирует описание: плашки (без «есть»/«нет») + развёрнутый текст
 */
const generateDescription = (project) => {
  const badges = [];
  if (project.bedrooms != null) badges.push(declenseBedroom(project.bedrooms));
  badges.push('Кухня-гостиная');
  if (project.has_terrace) badges.push('Терраса');
  if (project.has_garage) badges.push('Гараж');
  if (project.has_second_floor) badges.push('2 этажа');
  const badgesStr = badges.join(' • ');
  const parts = [];
  parts.push(`Уютный ${project.has_second_floor ? 'двухэтажный' : 'одноэтажный'} дом из ${project.material || 'качественного материала'}.`);
  if (project.area) parts.push(`Общая площадь — ${project.area} м².`);
  parts.push(`Продуманная планировка: ${project.bedrooms ? `${declenseBedroom(project.bedrooms)}, ` : ''}светлая кухня-гостиная${project.has_garage ? ', удобный гараж' : ''}.`);
  if (project.has_terrace) parts.push('Просторная терраса для семейного отдыха.');
  parts.push('Идеальный вариант для семьи, которая ценит уют и качество. 🌲');
  const poetic = parts.join(' ');
  return `${badgesStr}\n\n${poetic}`;
};

module.exports = { parseProject, generateDescription };
