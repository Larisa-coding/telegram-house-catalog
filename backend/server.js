const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db');
const { parseProject, generateDescription } = require('./parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Инициализация БД при старте
initDB().catch(console.error);

// Telegram bot init (polling локально, webhook на Railway если задан PUBLIC_BASE_URL)
let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  const { createBot } = require('./bot');
  bot = createBot();
}

// Webhook endpoint for Telegram (нужен только в webhook режиме)
app.post('/api/telegram/webhook', (req, res) => {
  try {
    if (!bot) return res.sendStatus(503);
    bot.processUpdate(req.body);
    return res.sendStatus(200);
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.sendStatus(500);
  }
});

// GET /api/projects - все проекты с фильтрами
app.get('/api/projects', async (req, res) => {
  try {
    const { material, minArea, maxArea, search, projectId, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM projects WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (material) {
      paramCount++;
      query += ` AND material = $${paramCount}`;
      params.push(material);
    }

    if (minArea) {
      paramCount++;
      query += ` AND area >= $${paramCount}`;
      params.push(parseFloat(minArea));
    }

    if (maxArea) {
      paramCount++;
      query += ` AND area <= $${paramCount}`;
      params.push(parseFloat(maxArea));
    }

    if (projectId) {
      paramCount++;
      query += ` AND project_id = $${paramCount}`;
      params.push(parseInt(projectId));
    } else if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY parsed_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    
    // Генерируем описания для каждого проекта
    const projects = result.rows.map(project => ({
      ...project,
      formatted_description: generateDescription(project),
    }));

    res.json({
      success: true,
      data: projects,
      total: projects.length,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/projects/:id - детальная карточка
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM projects WHERE id = $1 OR project_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = result.rows[0];
    project.formatted_description = generateDescription(project);

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/parse/:id - парсинг нового проекта
app.post('/api/parse/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectData = await parseProject(id);

    if (!projectData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found or not from specified contractor' 
      });
    }

    // Проверяем, существует ли проект
    const existing = await pool.query(
      'SELECT id FROM projects WHERE project_id = $1',
      [projectData.project_id]
    );

    if (existing.rows.length > 0) {
      // Обновляем существующий
      const updateQuery = `
        UPDATE projects 
        SET name = $1, area = $2, material = $3, price = $4, 
            bedrooms = $5, has_kitchen_living = $6, has_garage = $7,
            has_second_floor = $8, has_terrace = $9, description = $10,
            images = $11, url = $12, parsed_at = CURRENT_TIMESTAMP
        WHERE project_id = $13
        RETURNING *
      `;
      const result = await pool.query(updateQuery, [
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
        projectData.project_id,
      ]);

      return res.json({ 
        success: true, 
        message: 'Project updated',
        data: result.rows[0] 
      });
    } else {
      // Создаем новый
      const insertQuery = `
        INSERT INTO projects (
          project_id, name, area, material, price, bedrooms,
          has_kitchen_living, has_garage, has_second_floor, has_terrace,
          description, images, url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      const result = await pool.query(insertQuery, [
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

      return res.json({ 
        success: true, 
        message: 'Project created',
        data: result.rows[0] 
      });
    }
  } catch (error) {
    console.error('Error parsing project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/materials - уникальные материалы для фильтров
app.get('/api/materials', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT material FROM projects WHERE material IS NOT NULL ORDER BY material'
    );
    const materials = result.rows.map(row => row.material);
    res.json({ success: true, data: materials });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ручной запуск cron для проверки новых проектов
app.post('/api/cron/check', async (req, res) => {
  try {
    const { checkNewProjects } = require('./cron');
    await checkNewProjects();
    res.json({ success: true, message: 'Cron job executed' });
  } catch (error) {
    console.error('Error running cron:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/parse-batch - массовый парсинг проектов (без ограничений по ID)
app.post('/api/parse-batch', async (req, res) => {
  try {
    const { startId, endId, step = 1, maxProjects = 1000 } = req.body;
    const { parseProject } = require('./parser');
    
    // Определяем диапазон для проверки
    let actualStartId = startId;
    let actualEndId = endId;
    
    if (!startId || !endId) {
      // Получаем максимальный ID из БД
      const maxResult = await pool.query(
        'SELECT MAX(project_id) as max_id FROM projects'
      );
      const maxId = maxResult.rows[0]?.max_id;
      
      if (!maxId) {
        // БД пустая - начинаем с минимального известного ID
        actualStartId = 45;
        actualEndId = 100000; // Проверяем очень широкий диапазон
      } else {
        // Продолжаем с последнего найденного
        actualStartId = maxId + 1;
        actualEndId = maxId + maxProjects; // Проверяем следующие N проектов
      }
    }
    
    console.log(`Starting batch parsing from ${actualStartId} to ${actualEndId} (checking all IDs)`);
    let parsed = 0;
    let skipped = 0;
    let errors = 0;
    let notFound = 0;
    let consecutiveNotFound = 0;
    const maxConsecutiveNotFound = 100; // Останавливаемся если 100 подряд не найдено
    
    for (let projectId = actualStartId; projectId <= actualEndId; projectId += step) {
      try {
        // Проверяем, есть ли уже проект
        const existing = await pool.query(
          'SELECT id FROM projects WHERE project_id = $1',
          [projectId]
        );
        
        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }
        
        // Парсим проект
        const projectData = await parseProject(projectId.toString());
        
        if (!projectData) {
          notFound++;
          consecutiveNotFound++;
          // Если много подряд не найдено, возможно достигли конца диапазона
          if (consecutiveNotFound >= maxConsecutiveNotFound && !startId && !endId) {
            console.log(`Stopping: ${maxConsecutiveNotFound} consecutive projects not found`);
            break;
          }
          continue;
        }
        
        consecutiveNotFound = 0; // Сбрасываем счетчик при успешном парсинге
        
        // Сохраняем в БД
        const insertQuery = `
          INSERT INTO projects (
            project_id, name, area, material, price, bedrooms,
            has_kitchen_living, has_garage, has_second_floor, has_terrace,
            description, images, url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (project_id) DO NOTHING
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
        
        parsed++;
        
        // Небольшая задержка между запросами
        if (parsed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        if (error.message && error.message.includes('404') || error.message.includes('not found')) {
          notFound++;
        } else {
          console.error(`Error parsing project ${projectId}:`, error.message);
          errors++;
        }
      }
    }
    
    res.json({
      success: true,
      message: `Batch parsing completed`,
      stats: { 
        parsed, 
        skipped, 
        errors, 
        notFound,
        total: Math.floor((actualEndId - actualStartId) / step) + 1,
        range: `${actualStartId} - ${actualEndId}`
      }
    });
  } catch (error) {
    console.error('Error in batch parsing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot is active');
  }
});
