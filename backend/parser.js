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

    // Материал (ищем в разделе "Конструктивные решения" -> "Материал наружных стен")
    let material = null;
    const bodyText = $('body').text();
    
    // Ищем конкретные материалы
    if (bodyText.match(/Материал наружных стен[^]*?брус/i) || 
        bodyText.match(/Дома из бруса/i) ||
        bodyText.toLowerCase().includes('брус')) {
      material = 'брус';
    } else if (bodyText.match(/Материал наружных стен[^]*?газобетон/i) ||
               bodyText.match(/Дома из газобетона/i) ||
               bodyText.toLowerCase().includes('газобетон')) {
      material = 'газобетон';
    }

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
      return /logo|favicon|icon|emblem|brand|header|nav|avatar|sprite|banner|button|уютн/.test(lower) ||
        /\/icons?\/|\/logo\/|logo\.(png|svg|jpg|jpeg|gif)|favicon\./.test(lower);
    };

    const images = [];
    const seen = new Set();

    const addImage = (src) => {
      if (!src || seen.has(src) || isLogoOrIcon(src) || images.length >= 20) return;
      if (!src.startsWith('http')) {
        src = src.startsWith('//') ? `https:${src}` : `${BASE_URL}${src}`;
      }
      seen.add(src);
      images.push(src);
    };

    // 1. Галерея проекта, рендеры домов
    $('[class*="gallery"], [class*="slider"], [class*="carousel"], [class*="project"] img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-srcset')?.split(' ')[0];
      addImage(src);
    });

    // 2. Планировки этажей (floor plans)
    $('img[src*="plan"], img[src*="планир"], img[alt*="план"], img[alt*="этаж"]').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      addImage(src);
    });

    $('[class*="plan"], [class*="floor"], [class*="layout"] img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      addImage(src);
    });

    // 3. Остальные изображения проекта (рендеры)
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
      if (src && (src.includes('project') || src.includes('house') || src.includes('dom') || src.includes('/upload/'))) {
        addImage(src);
      }
    });

    while (images.length < 6) {
      let added = false;
      $('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && src.includes('http') && !isLogoOrIcon(src) && !seen.has(src)) {
          addImage(src);
          added = true;
          return false;
        }
      });
      if (!added) break;
    }

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

/**
 * Генерирует описание: плашки (без «есть»/«нет») + развёрнутый текст
 */
const generateDescription = (project) => {
  const badges = [];
  if (project.bedrooms != null) badges.push(`Спальни — ${project.bedrooms}`);
  badges.push('Кухня-гостиная');
  if (project.has_terrace) badges.push('Терраса');
  if (project.has_garage) badges.push('Гараж');
  if (project.has_second_floor) badges.push('2 этажа');
  const badgesStr = badges.join(' • ');
  const parts = [];
  parts.push(`Уютный ${project.has_second_floor ? 'двухэтажный' : 'одноэтажный'} дом из ${project.material || 'качественного материала'}.`);
  if (project.area) parts.push(`Общая площадь — ${project.area} м².`);
  parts.push(`Продуманная планировка: ${project.bedrooms ? `${project.bedrooms} спален, ` : ''}светлая кухня-гостиная${project.has_garage ? ', удобный гараж' : ''}.`);
  if (project.has_terrace) parts.push('Просторная терраса для семейного отдыха.');
  parts.push('Идеальный вариант для семьи, которая ценит уют и качество. 🌲');
  const poetic = parts.join(' ');
  return `${badgesStr}\n\n${poetic}`;
};

module.exports = { parseProject, generateDescription };
