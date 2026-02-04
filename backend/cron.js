const { pool } = require('./db');
const { parseProject, generateDescription } = require('./parser');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

/**
 * Проверяет новые проекты и постит в канал
 */
const checkNewProjects = async () => {
  try {
    console.log('Starting cron job to check new projects...');
    
    // Получаем последний проверенный project_id
    const lastProject = await pool.query(
      'SELECT MAX(project_id) as max_id FROM projects'
    );
    const lastId = lastProject.rows[0]?.max_id || 77000; // Начинаем с примерного ID
    
    // Проверяем диапазон проектов (например, последние 100)
    const checkRange = 100;
    const startId = lastId;
    const endId = lastId + checkRange;
    
    console.log(`Checking projects from ${startId} to ${endId}`);
    
    for (let projectId = startId; projectId <= endId; projectId++) {
      try {
        // Проверяем, есть ли уже проект
        const existing = await pool.query(
          'SELECT id, posted_to_channel FROM projects WHERE project_id = $1',
          [projectId]
        );
        
        if (existing.rows.length > 0 && existing.rows[0].posted_to_channel) {
          continue; // Уже обработан
        }
        
        // Парсим проект
        const projectData = await parseProject(projectId);
        
        if (!projectData) {
          continue; // Не наш проект или ошибка парсинга
        }
        
        // Сохраняем в БД
        if (existing.rows.length === 0) {
          // Новый проект
          const insertQuery = `
            INSERT INTO projects (
              project_id, name, area, material, price, bedrooms,
              has_kitchen_living, has_garage, has_second_floor, has_terrace,
              description, images, url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
          `;
          await pool.query(insertQuery, [
            projectData.project_id,
            projectData.name,
            projectData.area,
            projectData.material,
            projectData.price,
            projectData.bedrooms,
            projectData.has_kitchen_living,
            projectData.has_garage,
            projectData.has_second_floor,
            projectData.has_terrace,
            projectData.description,
            JSON.stringify(projectData.images),
            projectData.url,
          ]);
        }
        
        // Постим в канал, если еще не постили
        if (existing.rows.length === 0 || !existing.rows[0].posted_to_channel) {
          await postToChannel(projectData);
          
          // Отмечаем как отправленный
          await pool.query(
            'UPDATE projects SET posted_to_channel = true WHERE project_id = $1',
            [projectId]
          );
        }
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error processing project ${projectId}:`, error.message);
        continue;
      }
    }
    
    console.log('Cron job completed');
  } catch (error) {
    console.error('Error in cron job:', error);
  }
};

/**
 * Отправляет проект в Telegram канал
 */
const postToChannel = async (projectData) => {
  try {
    const description = generateDescription(projectData);
    
    let caption = `🏠 *${projectData.name}*\n\n`;
    
    if (projectData.area) {
      caption += `Площадь: ${projectData.area} м²`;
    }
    if (projectData.material) {
      caption += ` | Материал: ${projectData.material}`;
    }
    caption += '\n';
    
    if (projectData.price) {
      caption += `Цена: ${projectData.price.toLocaleString('ru-RU')} ₽\n\n`;
    }
    
    caption += description;
    caption += `\n\n[Подробнее](${projectData.url})`;
    
    // Отправляем первое фото с подписью
    if (projectData.images && projectData.images.length > 0) {
      await bot.sendPhoto(CHANNEL_ID, projectData.images[0], {
        caption: caption,
        parse_mode: 'Markdown',
      });
    } else {
      await bot.sendMessage(CHANNEL_ID, caption, {
        parse_mode: 'Markdown',
      });
    }
    
    console.log(`Posted project ${projectData.project_id} to channel`);
  } catch (error) {
    console.error('Error posting to channel:', error);
  }
};

// Запуск cron каждые 2 часа
if (require.main === module) {
  // Запускаем сразу при старте
  checkNewProjects();
  
  // Затем каждые 2 часа
  setInterval(checkNewProjects, 2 * 60 * 60 * 1000);
}

module.exports = { checkNewProjects, postToChannel };
