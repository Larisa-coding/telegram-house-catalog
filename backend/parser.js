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

    // Основные плашки — Content_general__item (площадь, материал, спальни, ванные)
    let area = null;
    let material = null;
    let bedrooms = null;
    $('[class*="Content_general__item"]').each((i, el) => {
      const $item = $(el);
      const ps = $item.find('p');
      if (ps.length < 2) return;
      const label = ps.eq(0).text().trim();
      const value = ps.eq(1).text().trim();
      if (label === 'Площадь дома' && value) {
        const m = value.match(/(\d+[,.]?\d*)/);
        if (m) area = parseFloat(m[1].replace(',', '.'));
      } else if (label === 'Материал стен' && value && value !== '—' && value !== '-') {
        const v = value.toLowerCase();
        if (/газобетон|газоблок/.test(v)) material = 'газобетон';
        else if (/\bбрус\b|пиленый|клееный|профилированный/.test(v)) material = 'брус';
      } else if (label === 'Спальни' && value) {
        const n = parseInt(value, 10);
        if (!isNaN(n)) bedrooms = n;
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

    // Материал — fallback если не найден в Content_general
    const bodyText = $('body').text();

    const extractMaterial = () => {
      if (material) return;
      const setFromVal = (val) => {
        const v = String(val).toLowerCase().trim();
        if (!v || v === '—' || v === '-') return false;
        if (/газобетон|газоблок|газоблочный|газобетонные/.test(v)) { material = 'газобетон'; return true; }
        if (/\bбрус\b|клееный брус|профилированный брус|пиленый брус|брусовой|из бруса/.test(v)) { material = 'брус'; return true; }
        return false;
      };

      // 0. Конструктивные решения — Table_row: "Материал наружных стен и несущих конструкций" → вторая колонка (ValueWithHint)
      $('[class*="Table_row"]').each((i, el) => {
        const txt = $(el).text();
        if (/Материал\s+наружных\s+стен/i.test(txt)) {
          const cols = $(el).find('[class*="Table_col"]');
          const val = cols.eq(1).find('[class*="ValueWithHint"], p').first().text().trim() || cols.eq(1).text().trim();
          if (setFromVal(val)) return false;
        }
      });
      if (material) return;

      // 1. Строим.дом.рф: <p>Материал стен</p><p>Газобетон</p>
      $('p').each((i, el) => {
        if (/Материал\s+(наружных\s+)?стен/i.test($(el).text().trim()) && $(el).text().trim().length < 30) {
          const next = $(el).next('p');
          if (next.length && setFromVal(next.text())) return false;
        }
      });
      if (material) return;

      // 1. dt/dd: <dt>Материал наружных стен</dt><dd>Газобетон</dd>
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

      // 3. Контекст "Материал наружных стен" или "Материал стен"
      const near = bodyText.match(/Материал\s+(наружных\s+)?стен\s*[:\s]*([а-яёА-ЯЁ\s\-]+?)(?:\n|$|Площадь|Спальни|м²)/i);
      if (near && setFromVal(near[2] || near[1])) return;

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
      if (/газобетон|газоблок|газоблочный|газобетонные/i.test(bodyText)) material = 'газобетон';
      else if (/\bбрус\b|клееный брус|профилированный брус|брусовой|из бруса/i.test(bodyText)) material = 'брус';
    };

    extractMaterial();

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

    const addTo = (arr, src, max, skipLogo = true) => {
      if (!src || seen.has(src) || arr.length >= max) return;
      if (skipLogo && isLogoOrIcon(src)) return;
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
      if (src && !isFloorPlan(src) && !isTinyThumbnail(src)) {
        addTo(housePhotos, src, 30);
        return false;
      }
    });
    $('section[class*="TopInfo_images"] img, div[class*="TopInfo_images"] img').each((i, el) => {
      const src = getImgSrc(el);
      if (src && !isFloorPlan(src) && !isTinyThumbnail(src)) addTo(housePhotos, src, 30);
    });

    // 2. Остальные img — resizer, upload, iblock
    $('img').each((i, el) => {
      const src = getImgSrc(el);
      if (!src || isFloorPlan(src)) return;
      if (src.includes('resizer') || src.includes('/upload/') || src.includes('iblock') || src.includes('project') || src.includes('house') || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(src)) {
        addTo(housePhotos, src, 30);
      }
    });

    // 3. Галерея, слайдер
    $('[class*="gallery"], [class*="slider"], [class*="carousel"] img').each((i, el) => {
      const src = getImgSrc(el);
      if (src && !isFloorPlan(src)) addTo(housePhotos, src, 30);
    });

    // 4. Fallback — любые img
    if (housePhotos.length < 3) {
      $('img').each((i, el) => {
        const src = getImgSrc(el);
        if (src && (src.startsWith('http') || src.startsWith('//') || src.startsWith('/'))) addTo(housePhotos, src, 30);
      });
    }

    // 5. Крупные фото первыми — tiny thumbnails (width=32) в конец
    const bigFirst = housePhotos.filter((u) => !isTinyThumbnail(u));
    const tiny = housePhotos.filter((u) => isTinyThumbnail(u));
    housePhotos.length = 0;
    housePhotos.push(...bigFirst, ...tiny);

    // 4. ПОЭТАЖНЫЙ ПЛАН — из __NEXT_DATA__ (projectPlans.imageFileIds)
    try {
      const nextDataEl = $('script#__NEXT_DATA__');
      if (nextDataEl.length) {
        const nextData = JSON.parse(nextDataEl.html());
        const state = nextData?.props?.pageProps?.initialState || {};
        const findProject = (obj) => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj.projectPlans && Array.isArray(obj.projectPlans)) return obj;
          for (const k of Object.keys(obj)) {
            const found = findProject(obj[k]);
            if (found) return found;
          }
          return null;
        };
        const project = findProject(state);
        if (project?.projectPlans) {
          const resizerBase = `${BASE_URL}/resizer/v2/image`;
          project.projectPlans.forEach((p) => {
            (p.imageFileIds || []).forEach((fid) => {
              const hex = String(fid).replace(/[^0-9A-Fa-f]/g, '');
              if (hex.length >= 10) {
                const pairs = hex.match(/.{2}/g) || [];
                const imageUrl = pairs.join('%2F');
                const url = `${resizerBase}?dpr=1&enlarge=true&height=0&imageUrl=${imageUrl}&quality=80&resizeType=fill&systemClientId=igs-client&width=1032`;
                addTo(floorPlans, url, 25);
              }
            });
          });
        }
      }
    } catch (e) { /* ignore */ }

    // 5. Дополнительно: img с plan/планир/этаж в src или alt
    $('img[src*="plan"], img[src*="планир"], img[src*="этаж"], img[alt*="план"], img[alt*="этаж"]').each((i, el) => {
      const src = getImgSrc(el);
      if (src) addTo(floorPlans, src, 25);
    });
    $('[class*="plan"], [class*="floor"], [class*="layout"], [class*="планиров"] img').each((i, el) => {
      const src = getImgSrc(el);
      if (src && isFloorPlan(src)) addTo(floorPlans, src, 25);
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
  if (project.material) badges.push(project.material.charAt(0).toUpperCase() + project.material.slice(1));
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
