const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const CONTRACTOR_ID = process.env.CONTRACTOR_ID || '9465';
const BASE_URL = process.env.BASE_URL || 'https://строим.дом.рф';

/**
 * Справочник outerWallMaterial (ID → название). Источник: строим.дом.рф / dom.rf.
 * Дополняй по мере обнаружения новых ID.
 */
const OUTER_WALL_MATERIAL_MAP = {
  1: 'Кирпич',
  2: 'Газобетонные блоки',
  3: 'Керамзитобетонные блоки',
  4: 'Керамические блоки',
  5: 'Дерево',
  6: 'СИП-панели',
  7: 'Каркас',
  8: 'Арболит',
  9: 'Пенобетонные блоки',
  10: 'Газосиликатные блоки',
  11: 'Газобетонные блоки',
  12: 'Оцилиндрованное бревно',
  13: 'Пиленый брус',
  14: 'Теплоблок',
  15: 'Профилированный брус',
};

/**
 * Материал из __NEXT_DATA__ (outerWallMaterial ID).
 * @param {string} html - HTML страницы
 * @returns {string|null}
 */
const parseMaterialFromNextData = (html) => {
  try {
    const $ = cheerio.load(html);
    const script = $('script#__NEXT_DATA__').html();
    if (!script) return null;
    const nextData = JSON.parse(script);
    const entities = nextData?.props?.pageProps?.initialState?.detailEntities?.project?.entities;
    if (!entities || typeof entities !== 'object') return null;
    for (const key of Object.keys(entities)) {
      const realization = entities[key]?.realization;
      const id = realization?.outerWallMaterial;
      if (id != null && OUTER_WALL_MATERIAL_MAP[id]) {
        return OUTER_WALL_MATERIAL_MAP[id];
      }
    }
  } catch (e) { /* ignore */ }
  return null;
};

/**
 * ТОЧНЫЙ материал наружных стен — сначала из __NEXT_DATA__, затем из HTML.
 * @param {string} html - HTML страницы проекта
 * @returns {string|null} - точное значение материала или null, если не найдено
 */
const parseMaterial = (html) => {
  const fromNextData = parseMaterialFromNextData(html);
  if (fromNextData) return fromNextData;

  const $ = cheerio.load(html);
  const labelPattern = /Материал\s+(наружных\s+)?стен|Материал\s+стен/i;
  const empty = (v) => !v || v === '—' || v === '-';

  const takeVal = (val) => (val && !empty(String(val).trim()) ? String(val).trim() : null);

  let found = null;

  // 1. Content_general_item — плашка "Материал стен"
  const contentItem = $('[class*="Content_general_item"], [class*="Content_general__item"]').filter((i, el) => {
    const ps = $(el).find('p');
    return ps.length >= 2 && labelPattern.test(ps.eq(0).text().trim());
  });
  if (contentItem.length) {
    const val = takeVal(contentItem.first().find('p').eq(1).text());
    if (val) return val;
  }

  // 3. Table_row — "Материал наружных стен" → вторая колонка (ValueWithHint, p[data-testid], любой текст)
  $('[class*="Table_row"]').each((i, el) => {
    if (found) return;
    if (!labelPattern.test($(el).text())) return;
    const col2 = $(el).find('[class*="Table_col"]').eq(1);
    const val = col2.find('[class*="ValueWithHint"]').first().text().trim() ||
      col2.find('p[data-testid="typography"]').text().trim() ||
      col2.find('p').last().text().trim() ||
      col2.find('span').last().text().trim() ||
      col2.text().trim();
    const v = takeVal(val);
    if (v) found = v;
  });
  if (found) return found;

  // 4. th:contains("материал") + td, dt/dd
  $('th').each((i, el) => {
    if (found) return;
    if (!labelPattern.test($(el).text())) return;
    const v = takeVal($(el).next('td').text() || $(el).siblings('td').first().text());
    if (v) found = v;
  });
  $('dt').each((i, el) => {
    if (found) return;
    if (!labelPattern.test($(el).text())) return;
    const v = takeVal($(el).next('dd').text());
    if (v) found = v;
  });
  if (found) return found;

  // 5. tr td — ячейка с "Материал" → соседняя ячейка
  $('tr').each((i, el) => {
    if (found) return;
    const cells = $(el).find('td, th');
    for (let j = 0; j < cells.length - 1; j++) {
      if (labelPattern.test($(cells[j]).text().trim()) && $(cells[j]).text().trim().length < 80) {
        const val = takeVal($(cells[j + 1]).text());
        if (val) { found = val; return; }
      }
    }
  });
  if (found) return found;

  // 6. p + next p
  $('p').each((i, el) => {
    if (found) return;
    const label = $(el).text().trim();
    if (labelPattern.test(label) && label.length < 40) {
      const v = takeVal($(el).next('p').text());
      if (v) found = v;
    }
  });
  if (found) return found;

  return null;
};

/**
 * ВСЕ фото из раздела "Поэтажный план" — без пропусков.
 * Ищет секцию с "Поэтажный план" / PlanList_plan и возвращает все img.
 * @param {string} html - HTML страницы
 * @returns {string[]} - массив URL планов этажей
 */
const parseFloorPlans = (html) => {
  const $ = cheerio.load(html);
  const resizerBase = `${BASE_URL}/resizer/v2/image`;
  const upgradeUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    const s = url.replace(/width=\d+/, 'width=1200').replace(/quality=\d+/, 'quality=90');
    if (!s.startsWith('http')) return s.startsWith('//') ? `https:${s}` : `${BASE_URL}${s.startsWith('/') ? s : '/' + s}`;
    return s;
  };
  const seen = new Set();
  const plans = [];

  const addPlan = (src) => {
    if (!src) return;
    const u = upgradeUrl(src);
    if (seen.has(u)) return;
    seen.add(u);
    plans.push(u);
  };

  // 1. Раздел "Поэтажный план" — строим.дом.рф: PlanList_plan; или h2/h3 с "Поэтажный план"
  let planSection = $('[class*="PlanList_plan"], [class*="PlanList_plar"], [class*="PlanList"]').first();
  if (!planSection.length) {
    planSection = $('h2, h3, h4').filter((i, el) => /поэтажн|план\s*этаж/i.test($(el).text())).first();
  }
  if (planSection.length) {
    const $container = planSection.has('img').length ? planSection : planSection.parent();
    $container.find('img').each((i, el) => {
      const s = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset')?.split(/\s+/)[0];
      if (s && (s.includes('resizer') || /\.(jpg|jpeg|png|webp)/i.test(s))) addPlan(s);
    });
  }

  // 2. PlanList_plan, swiper-slide — строим.дом.рф
  $('[class*="PlanList_plan"], [class*="PlanList_plar"], [class*="swiper-slide"] img').each((i, el) => {
    const alt = ($(el).attr('alt') || '').toLowerCase();
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset')?.split(/\s+/)[0];
    if (src && (/план|этаж/.test(alt) || src.includes('resizer'))) addPlan(src);
  });

  // 3. img alt="План 1 этажа", "План 2 этажа" и т.д.
  $('img[alt*="План"], img[alt*="план"]').each((i, el) => {
    const alt = ($(el).attr('alt') || '').toLowerCase();
    if (!/этаж/.test(alt)) return;
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset')?.split(/\s+/)[0];
    if (src) addPlan(src);
  });

  // 4. __NEXT_DATA__ projectPlans.imageFileIds — всегда парсим (HTML часто без планов до hydration)
  try {
    const nextData = JSON.parse($('script#__NEXT_DATA__').html() || '{}');
    const findPlans = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.projectPlans && Array.isArray(obj.projectPlans)) return obj;
      for (const k of Object.keys(obj)) {
        const r = findPlans(obj[k]);
        if (r) return r;
      }
      return null;
    };
    const proj = findPlans(nextData?.props?.pageProps?.initialState || {});
    if (proj?.projectPlans) {
      proj.projectPlans.forEach((p) => {
        const ids = p.imageFileIds || (p.imageFileId ? [p.imageFileId] : []);
        ids.forEach((fid) => {
          const hex = String(fid).replace(/[^0-9A-Fa-f]/g, '');
          if (hex.length >= 10) {
            const imageUrl = (hex.match(/.{2}/g) || []).join('%2F');
            addPlan(`${resizerBase}?dpr=1.5&enlarge=true&height=0&imageUrl=${imageUrl}&quality=90&resizeType=fill&systemClientId=igs-client&width=1200`);
          }
        });
      });
    }
  } catch (e) { /* ignore */ }

  return plans;
};

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

    // Основные плашки — Content_general_item (площадь, спальни, ванные). Материал — только через parseMaterialFromPage.
    let area = null;
    let bedrooms = null;
    $('[class*="Content_general_item"], [class*="Content_general__item"]').each((i, el) => {
      const $item = $(el);
      const ps = $item.find('p');
      if (ps.length < 2) return;
      const label = ps.eq(0).text().trim();
      const value = ps.eq(1).text().trim();
      if (label === 'Площадь дома' && value) {
        const m = value.match(/(\d+[,.]?\d*)/);
        if (m) area = parseFloat(m[1].replace(',', '.'));
      } else if (label === 'Спальни' && value) {
        const n = parseInt(value, 10);
        if (!isNaN(n)) bedrooms = n;
      }
    });

    const material = parseMaterial(response.data);

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

    const bodyText = $('body').text();

    // Спальни — fallback если не найдены в Content_general
    if (bedrooms == null) {
      $('p').each((i, el) => {
        if ($(el).text().trim() === 'Спальни') {
          const next = $(el).next('p');
          const val = next.length ? next.text().trim() : '';
          const num = parseInt(val, 10);
          if (!isNaN(num)) { bedrooms = num; return false; }
        }
      });
    }
    if (bedrooms == null) {
      const bedroomsMatch = bodyText.match(/Спальни[:\s\-—]+(\d+)/i) ||
        bodyText.match(/Количество\s+спален[:\s\-—]+(\d+)/i) ||
        bodyText.match(/(\d+)\s*спален(?!и)/i) ||
        bodyText.match(/(\d+)\s*спальн/i);
      if (bedroomsMatch) bedrooms = parseInt(bedroomsMatch[1]);
    }

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
      return /logo|favicon|icon\.(png|svg|jpg|gif)|emblem|sprite|banner|button|watermark|nophoto/.test(lower) ||
        /\/icons?\/|\/logo\/|\/favicon\.|logo\.(png|svg|jpg|jpeg|gif)/.test(lower);
    };

    const isFloorPlan = (url) => {
      if (!url || typeof url !== 'string') return false;
      const lower = url.toLowerCase();
      return /plan|планир|этаж|floor|layout|чертеж|схема/i.test(lower);
    };

    const seen = new Set();
    const housePhotos = [];
    const floorPlans = [];

    const isLogoImg = (el) => {
      if (!el) return false;
      const $el = $(el);
      const alt = ($el.attr('alt') || '').toLowerCase().trim();
      const title = ($el.attr('title') || '').toLowerCase().trim();
      // Только явный логотип в alt/title — не "уютный" (названия проектов: Уютный Х-38)
      if (/^(уютный\s+дом|каталог|логотип)\s*$|логотип|строительство.*будущее/.test(alt)) return true;
      if (/^(уютный\s+дом|каталог|логотип)\s*$/.test(title)) return true;
      const parent = $el.closest('[class*="logo"], [class*="brand"]');
      if (parent.length && parent.text().length < 80) return true;
      return false;
    };

    const addTo = (arr, src, max, skipLogo = true, el) => {
      if (!src || seen.has(src) || arr.length >= max) return;
      if (skipLogo && (isLogoOrIcon(src) || (el && isLogoImg(el)))) return;
      if (!src.startsWith('http')) {
        src = src.startsWith('//') ? `https:${src}` : `${BASE_URL}${src.startsWith('/') ? src : '/' + src}`;
      }
      seen.add(src);
      arr.push(src);
    };

    const getImgSrc = (el) => $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-srcset')?.split(/\s+/)[0];

    const isTinyThumbnail = (url) => /width=32|width=64|height=32|height=64/.test(url);

    // 1. Заглавная картинка — TopInfo_images_first (первое фото проекта, не логотип)
    $('[class*="TopInfo_images_first"], [class*="images_first"]').find('img, picture img, picture source').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('srcset')?.split(/\s+/)[0] || getImgSrc(el);
      if (src && !isFloorPlan(src) && !isTinyThumbnail(src) && !isLogoImg(el)) {
        addTo(housePhotos, src, 30, true, el);
        return false;
      }
    });
    $('section[class*="TopInfo_images"] img, div[class*="TopInfo_images"] img').each((i, el) => {
      const src = getImgSrc(el);
      if (src && !isFloorPlan(src) && !isTinyThumbnail(src) && !isLogoImg(el)) addTo(housePhotos, src, 30, true, el);
    });

    // 2. Остальные img — resizer, upload, iblock (исключаем логотип)
    $('img').each((i, el) => {
      if (isLogoImg(el)) return;
      const src = getImgSrc(el);
      if (!src || isFloorPlan(src)) return;
      if (src.includes('resizer') || src.includes('/upload/') || src.includes('iblock') || src.includes('project') || src.includes('house') || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(src)) {
        addTo(housePhotos, src, 30, true, el);
      }
    });

    // 3. Галерея, слайдер
    $('[class*="gallery"], [class*="slider"], [class*="carousel"] img').each((i, el) => {
      if (isLogoImg(el)) return;
      const src = getImgSrc(el);
      if (src && !isFloorPlan(src)) addTo(housePhotos, src, 30, true, el);
    });

    // 4. Fallback — любые img (кроме логотипа)
    if (housePhotos.length < 3) {
      $('img').each((i, el) => {
        if (isLogoImg(el)) return;
        const src = getImgSrc(el);
        if (src && (src.startsWith('http') || src.startsWith('//') || src.startsWith('/'))) addTo(housePhotos, src, 30, true, el);
      });
    }

    // 5. Крупные фото первыми — tiny thumbnails (width=32) в конец
    const bigFirst = housePhotos.filter((u) => !isTinyThumbnail(u));
    const tiny = housePhotos.filter((u) => isTinyThumbnail(u));
    housePhotos.length = 0;
    housePhotos.push(...bigFirst, ...tiny);

    // 6. Заглавная картинка (дом с лицевой стороны) — TopInfo_images_first / Image_image--cover — ВСЕГДА первая
    let coverSrc = null;
    $('[class*="TopInfo_images_first"], [class*="images_first"]').find('img, picture img, picture source').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('srcset')?.split(/\s+/)[0] || getImgSrc(el);
      if (src && !isFloorPlan(src) && !isTinyThumbnail(src) && !isLogoImg(el)) {
        coverSrc = src;
        return false;
      }
    });
    if (!coverSrc) $('img[class*="Image_image--cover"]').each((i, el) => {
      const src = getImgSrc(el);
      if (src && !isFloorPlan(src) && !isLogoImg(el)) { coverSrc = src; return false; }
    });
    if (coverSrc) {
      if (!coverSrc.startsWith('http')) coverSrc = coverSrc.startsWith('//') ? `https:${coverSrc}` : `${BASE_URL}${coverSrc.startsWith('/') ? coverSrc : '/' + coverSrc}`;
      const idx = housePhotos.indexOf(coverSrc);
      if (idx > 0) {
        housePhotos.splice(idx, 1);
        housePhotos.unshift(coverSrc);
      } else if (idx < 0 && housePhotos.length > 0) {
        housePhotos.unshift(coverSrc);
      } else if (idx === 0) { /* уже первая */ }
    }

    // 4. ВСЕ рендеры из __NEXT_DATA__ realization.imageFileIds (HTML содержит только 3, здесь — все)
    try {
      const nextData = JSON.parse($('script#__NEXT_DATA__').html() || '{}');
      const entities = nextData?.props?.pageProps?.initialState?.detailEntities?.project?.entities || {};
      const realization = entities[String(projectId)]?.realization || Object.values(entities)[0]?.realization;
      const renderIds = realization?.imageFileIds || [];
      const resizerBase = `${BASE_URL}/resizer/v2/image`;
      if (renderIds.length > 0) {
        housePhotos.length = 0;
        seen.clear();
        renderIds.forEach((fid) => {
          const hex = String(fid).replace(/[^0-9A-Fa-f]/g, '');
          if (hex.length >= 10) {
            const imageUrl = (hex.match(/.{2}/g) || []).join('%2F');
            const url = `${resizerBase}?dpr=1.5&enlarge=true&height=0&imageUrl=${imageUrl}&quality=90&resizeType=fill&systemClientId=igs-client&width=1200`;
            seen.add(url);
            housePhotos.push(url);
          }
        });
      }
    } catch (e) { /* ignore */ }

    // 5. ВСЕ ФОТО из раздела "Поэтажный план" — parseFloorPlans
    const parsedPlans = parseFloorPlans(response.data);
    parsedPlans.forEach((url) => {
      if (!seen.has(url)) {
        seen.add(url);
        floorPlans.push(url);
      }
    });

    const images = [...housePhotos, ...floorPlans];

    const projectData = {
      project_id: parseInt(projectId),
      name: name || `Проект ${projectId}`,
      area: area,
      material: material,
      floor_plans: floorPlans,
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
  if (project.material) badges.push(project.material.charAt(0).toUpperCase() + project.material.slice(1));
  badges.push('Кухня-гостиная');
  if (project.has_terrace) badges.push('Терраса');
  if (project.has_garage) badges.push('Гараж');
  if (project.has_second_floor) badges.push('2 этажа');
  const badgesStr = badges.join(' • ');
  const parts = [];
  parts.push(`Уютный ${project.has_second_floor ? 'двухэтажный' : 'одноэтажный'} дом из качественного материала.`);
  if (project.area) parts.push(`Общая площадь — ${project.area} м².`);
  parts.push(`Продуманная планировка: ${project.bedrooms ? `${declenseBedroom(project.bedrooms)}, ` : ''}светлая кухня-гостиная${project.has_garage ? ', удобный гараж' : ''}.`);
  if (project.has_terrace) parts.push('Просторная терраса для семейного отдыха.');
  parts.push('Идеальный вариант для семьи, которая ценит уют и качество. 🌲');
  const poetic = parts.join(' ');
  return `${badgesStr}\n\n${poetic}`;
};

module.exports = { parseProject, generateDescription, parseMaterial, parseFloorPlans };
