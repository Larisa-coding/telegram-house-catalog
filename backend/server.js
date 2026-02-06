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
    console.log('=== Webhook received ===');
    console.log('Update ID:', req.body?.update_id);
    console.log('Message:', req.body?.message?.text || 'No message');
    console.log('Callback query:', req.body?.callback_query?.data || 'No callback');
    
    if (!bot) {
      console.error('Bot not initialized');
      return res.sendStatus(503);
    }
    
    // Отвечаем сразу, чтобы Telegram не повторял запрос
    res.sendStatus(200);
    
    // Обрабатываем обновление асинхронно
    setImmediate(() => {
      try {
        bot.processUpdate(req.body);
      } catch (error) {
        console.error('Error processing update:', error);
      }
    });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.sendStatus(500);
  }
});

// GET /api/projects - все проекты с фильтрами
app.get('/api/projects', async (req, res) => {
  try {
    const { material, minArea, maxArea, search, limit = 50, offset = 0 } = req.query;
    
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

    if (search) {
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook info endpoint (для проверки статуса webhook)
app.get('/api/telegram/webhook-info', async (req, res) => {
  try {
    if (!bot) {
      return res.json({ error: 'Bot not initialized' });
    }
    const info = await bot.getWebHookInfo();
    res.json({ success: true, webhookInfo: info });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot is active');
  }
});
