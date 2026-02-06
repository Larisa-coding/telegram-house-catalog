const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const CONTRACTOR_ID = process.env.CONTRACTOR_ID || '9465';
const BASE_URL = process.env.BASE_URL || 'https://строим.дом.рф';

/**
 * Парсит страницу проекта с проверкой подрядчика
 */
const parseProject = async (projectId) => {
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

    // Проверка подрядчика
    const contractorId = $('[data-contractor-id]').attr('data-contractor-id') || 
                         $('.contractor-id').text().trim() ||
                         $('[data-id]').filter((i, el) => $(el).text().includes('9465')).attr('data-id');
    
    // Альтернативная проверка через текст страницы
    const pageText = $('body').text();
    const hasContractor = pageText.includes('9465') || 
                         pageText.includes('Юрова Любовь Владимировна') ||
                         $('a[href*="contractor/9465"]').length > 0;

    if (!hasContractor && contractorId !== CONTRACTOR_ID) {
      console.log(`Project ${projectId} is not from contractor ${CONTRACTOR_ID}`);
      return null;
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

    // Изображения
    const images = [];
    $('img').each((i, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.startsWith('http')) {
        src = src.startsWith('//') ? `https:${src}` : `${BASE_URL}${src}`;
      }
      if (src && src.includes('project') && images.length < 6) {
        images.push(src);
      }
    });

    // Если изображений не найдено, пробуем другие селекторы
    if (images.length === 0) {
      $('[class*="image"], [class*="photo"], [class*="gallery"] img').each((i, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src && !src.startsWith('http')) {
          src = src.startsWith('//') ? `https:${src}` : `${BASE_URL}${src}`;
        }
        if (src && images.length < 6) {
          images.push(src);
        }
      });
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
 * Генерирует описание проекта в стиле уютного дома
 */
const generateDescription = (project) => {
  const parts = [];
  
  // Начало
  parts.push(`🏠 Уютный ${project.has_second_floor ? 'двухэтажный' : 'одноэтажный'} дом из ${project.material || 'качественного материала'}`);
  
  // Площадь
  if (project.area) {
    parts.push(`Общая площадь — ${project.area} м²`);
  }
  
  // Планировка
  const features = [];
  if (project.bedrooms) {
    features.push(`${project.bedrooms} ${project.bedrooms === 1 ? 'просторная спальня' : project.bedrooms < 5 ? 'просторные спальни' : 'просторных спален'}`);
  }
  if (project.has_kitchen_living) {
    features.push('светлая кухня-гостиная');
  }
  if (project.has_garage) {
    features.push('удобный гараж');
  }
  if (features.length > 0) {
    parts.push(`Продуманная планировка: ${features.join(', ')}.`);
  }
  
  // Дополнительные особенности
  const extras = [];
  if (project.has_terrace) {
    extras.push('Просторная веранда отлично подходит для семейных завтраков на свежем воздухе ☕️');
  }
  if (project.has_second_floor) {
    extras.push('Второй этаж — тихое место для отдыха 🌿');
  }
  if (extras.length > 0) {
    parts.push(extras.join(', '));
  }
  
  // Заключение
  parts.push('Идеальный вариант для семьи, которая ценит уют, качество и природное тепло дерева. 🌲');
  
  return parts.join('. ') + '.';
};

module.exports = { parseProject, generateDescription };
