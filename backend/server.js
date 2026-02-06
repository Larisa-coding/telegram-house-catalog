const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { pool, initDB } = require('./db');
const { parseProject, generateDescription } = require('./parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const frontendDir = path.join(__dirname, '../frontend');

// Middleware
app.use(cors());
app.use(express.json());

// GET /api/config — base URL для фронта
app.get('/api/config', (req, res) => {
  const base = process.env.PUBLIC_BASE_URL || req.protocol + '://' + req.get('host');
  res.json({ apiBase: base.replace(/\/$/, '') });
});

// Главная — инжектим API_BASE для Telegram WebView (origin может быть web.telegram.org)
app.get('/', (req, res) => {
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  const base = process.env.PUBLIC_BASE_URL || process.env.RAILWAY_STATIC_URL || `${protocol}://${host}`;
  const indexPath = path.join(frontendDir, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const script = `<script>window.__API_BASE="${base.replace(/\/$/, '')}";</script>`;
  html = html.replace('</head>', script + '\n</head>');
  res.set('Content-Type', 'text/html');
  res.send(html);
});

app.use(express.static(frontendDir));

// Punycode для строим.дом.рф (Node.js лучше работает с ASCII-доменами)
const DOM_RF_PUNYCODE = 'https://xn--80az8a.xn--d1aqf.xn--p1ai';

// GET /api/proxy-image?url=... — прокси изображений (обход CORS для строим.дом.рф)
app.get('/api/proxy-image', async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'Missing url' });
    }
    let url = decodeURIComponent(rawUrl);
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      return res.status(400).json({ error: 'Invalid url' });
    }
    // IDN → punycode для надёжного запроса
    url = url.replace(/https?:\/\/строим\.дом\.рф/gi, DOM_RF_PUNYCODE);
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const ct = (resp.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', ct);
    res.send(Buffer.from(resp.data));
  } catch (e) {
    const errMsg = e.response?.status ? `HTTP ${e.response.status}` : e.message;
    console.error('proxy-image:', errMsg, req.query.url?.substring(0, 80));
    res.status(502).json({ error: 'Proxy error' });
  }
});

// POST /api/track-user - отслеживание пользователя
app.post('/api/track-user', express.json(), async (req, res) => {
  const user = req.body?.user;
  if (user && user.id) {
    await trackUser(user);
  }
  res.json({ success: true });
});

// Функция отслеживания пользователя
const trackUser = async (user) => {
  try {
    const { id, username, first_name, last_name } = user;
    const result = await pool.query(
      'SELECT id, visit_count FROM users WHERE telegram_id = $1',
      [id]
    );
    if (result.rows.length > 0) {
      await pool.query(
        'UPDATE users SET last_visit = CURRENT_TIMESTAMP, visit_count = visit_count + 1, username = COALESCE($1, username), first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name) WHERE telegram_id = $4',
        [username || null, first_name || null, last_name || null, id]
      );
    } else {
      await pool.query(
        'INSERT INTO users (telegram_id, username, first_name, last_name, first_visit, last_visit, visit_count) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)',
        [id, username || null, first_name || null, last_name || null]
      );
    }
  } catch (error) {
    console.error('Error tracking user:', error);
  }
};

// Явные маршруты для HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(frontendDir, 'admin.html'));
});

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

    if (projectId) {
      paramCount++;
      query += ` AND project_id = $${paramCount}`;
      params.push(parseInt(projectId));
    }

    if (material) {
      paramCount++;
      query += ` AND material ILIKE $${paramCount}`;
      params.push(`%${material}%`);
    }

    if (minArea) {
      paramCount++;
      query += ` AND (area IS NULL OR area >= $${paramCount})`;
      params.push(parseFloat(minArea));
    }

    if (maxArea) {
      paramCount++;
      query += ` AND (area IS NULL OR area <= $${paramCount})`;
      params.push(parseFloat(maxArea));
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    const limitNum = parseInt(limit) || 500;
    const offsetNum = parseInt(offset) || 0;

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || 0, 10);

    query += ` ORDER BY parsed_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limitNum, offsetNum);

    const result = await pool.query(query, params);

    const projects = result.rows.map((project) => ({
      ...project,
      formatted_description: generateDescription(project),
    }));

    res.json({
      success: true,
      data: projects,
      total,
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

// POST /api/parse/:id - парсинг и добавление проекта по ID с строим.дом.рф (любой проект, без проверки подрядчика)
app.post('/api/parse/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectData = await parseProject(id, { skipContractorCheck: true });

    if (!projectData) {
      return res.status(404).json({
        success: false,
        error: 'Проект не найден на строим.дом.рф или ошибка загрузки страницы',
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
            images = $11, floor_plans = $12, url = $13, parsed_at = CURRENT_TIMESTAMP
        WHERE project_id = $14
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
        JSON.stringify(projectData.floor_plans || []),
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
          description, images, floor_plans, url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        JSON.stringify(projectData.floor_plans || []),
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

// GET /api/seed - заполнить каталог по PROJECT_IDS из .env (один раз после деплоя)
// PROJECT_IDS=77279,12345,67890
app.get('/api/seed', async (req, res) => {
  try {
    const raw = process.env.PROJECT_IDS || '';
    const ids = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
    if (ids.length === 0) {
      return res.json({ success: true, message: 'PROJECT_IDS не задан. Добавляйте проекты через админку по ID.', created: 0, updated: 0, failed: [] });
    }
    const results = { created: 0, updated: 0, failed: [] };
    for (const id of ids) {
      const projectData = await parseProject(String(id), { skipContractorCheck: true });
      if (!projectData) {
        results.failed.push(id);
        continue;
      }
      const existing = await pool.query('SELECT id FROM projects WHERE project_id = $1', [projectData.project_id]);
      const floorPlansJson = JSON.stringify(projectData.floor_plans || []);
      const fields = [
        projectData.name, projectData.area, projectData.material, projectData.price,
        projectData.bedrooms, projectData.has_kitchen_living, projectData.has_garage,
        projectData.has_second_floor, projectData.has_terrace, projectData.description,
        JSON.stringify(projectData.images), floorPlansJson, projectData.url, projectData.project_id,
      ];
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE projects SET name=$1, area=$2, material=$3, price=$4, bedrooms=$5,
           has_kitchen_living=$6, has_garage=$7, has_second_floor=$8, has_terrace=$9,
           description=$10, images=$11, floor_plans=$12, url=$13, parsed_at=CURRENT_TIMESTAMP WHERE project_id=$14`,
          fields
        );
        results.updated += 1;
      } else {
        await pool.query(
          `INSERT INTO projects (project_id, name, area, material, price, bedrooms,
           has_kitchen_living, has_garage, has_second_floor, has_terrace, description, images, floor_plans, url)
           VALUES ($14, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          fields
        );
        results.created += 1;
      }
      await new Promise((r) => setTimeout(r, 2500 + Math.random() * 1500));
    }
    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Error seed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/parse-batch - заполнить каталог по списку ID (строим.дом.рф)
// Body: { projectIds: [77279, 12345, ...] } или { projectIds: "77279,12345" }
app.post('/api/parse-batch', async (req, res) => {
  try {
    let ids = req.body?.projectIds;
    if (typeof ids === 'string') {
      ids = ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number);
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Укажите projectIds: массив ID или строка через запятую',
      });
    }
    const results = { created: 0, updated: 0, failed: [] };
    for (const id of ids) {
      const projectData = await parseProject(String(id), { skipContractorCheck: true });
      if (!projectData) {
        results.failed.push(id);
        continue;
      }
      const existing = await pool.query('SELECT id FROM projects WHERE project_id = $1', [projectData.project_id]);
      const floorPlansJson = JSON.stringify(projectData.floor_plans || []);
      const fields = [
        projectData.name, projectData.area, projectData.material, projectData.price,
        projectData.bedrooms, projectData.has_kitchen_living, projectData.has_garage,
        projectData.has_second_floor, projectData.has_terrace, projectData.description,
        JSON.stringify(projectData.images), floorPlansJson, projectData.url, projectData.project_id,
      ];
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE projects SET name=$1, area=$2, material=$3, price=$4, bedrooms=$5,
           has_kitchen_living=$6, has_garage=$7, has_second_floor=$8, has_terrace=$9,
           description=$10, images=$11, floor_plans=$12, url=$13, parsed_at=CURRENT_TIMESTAMP WHERE project_id=$14`,
          fields
        );
        results.updated += 1;
      } else {
        await pool.query(
          `INSERT INTO projects (project_id, name, area, material, price, bedrooms,
           has_kitchen_living, has_garage, has_second_floor, has_terrace, description, images, floor_plans, url)
           VALUES ($14, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          fields
        );
        results.created += 1;
      }
      await new Promise((r) => setTimeout(r, 2500 + Math.random() * 1500));
    }
    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Error parse-batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/projects/:project_id - удалить проект по project_id (для лишних проектов)
app.delete('/api/projects/:project_id', async (req, res) => {
  try {
    const projectId = parseInt(req.params.project_id);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Некорректный project_id' });
    }
    const result = await pool.query('DELETE FROM projects WHERE project_id = $1 RETURNING id', [projectId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Проект не найден' });
    }
    res.json({ success: true, message: 'Проект удалён' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/delete-by-names - удалить проекты по частичному совпадению названия
app.post('/api/projects/delete-by-names', async (req, res) => {
  try {
    let names = req.body?.names;
    if (!Array.isArray(names)) names = typeof names === 'string' ? [names] : [];
    names = names.map((n) => String(n).trim()).filter(Boolean);
    if (names.length === 0) {
      return res.status(400).json({ success: false, error: 'Укажите names: массив названий для удаления' });
    }
    const result = await pool.query(
      `DELETE FROM projects WHERE ${names.map((_, i) => `name ILIKE $${i + 1}`).join(' OR ')} RETURNING project_id, name`,
      names.map((n) => `%${n}%`)
    );
    res.json({ success: true, deleted: result.rowCount, ids: result.rows.map((r) => r.project_id) });
  } catch (error) {
    console.error('Error delete-by-names:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/delete-batch - удалить несколько проектов по project_id
app.post('/api/projects/delete-batch', async (req, res) => {
  try {
    let ids = req.body?.projectIds;
    if (Array.isArray(ids)) ids = ids.map((x) => parseInt(String(x))).filter((x) => !isNaN(x));
    else if (typeof ids === 'string') ids = ids.split(/[\s,]+/).map((s) => parseInt(s.trim())).filter((x) => !isNaN(x));
    else ids = [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Укажите projectIds: массив ID или строка через запятую' });
    }
    const result = await pool.query(
      'DELETE FROM projects WHERE project_id = ANY($1::int[]) RETURNING project_id',
      [ids]
    );
    res.json({ success: true, deleted: result.rowCount, ids: result.rows.map((r) => r.project_id) });
  } catch (error) {
    console.error('Error delete-batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/reparse-materials - перепарсить все проекты (запуск в фоне, без таймаута)
app.post('/api/reparse-materials', async (req, res) => {
  try {
    const projects = await pool.query('SELECT project_id FROM projects ORDER BY id');
    const ids = projects.rows.map((r) => r.project_id);
    if (ids.length === 0) {
      return res.json({ success: true, updated: 0, failed: [], message: 'Проектов нет' });
    }
    res.json({ success: true, message: `Обновление запущено для ${ids.length} проектов. Подождите 2–5 мин, обновите каталог.`, started: ids.length });
    setImmediate(async () => {
      let updated = 0;
      const failed = [];
      for (const projectId of ids) {
        try {
          const projectData = await parseProject(String(projectId), { skipContractorCheck: true });
          if (!projectData) {
            failed.push(projectId);
            continue;
          }
          await pool.query(
            `UPDATE projects SET material=$1, name=$2, area=$3, price=$4, bedrooms=$5,
             has_kitchen_living=$6, has_garage=$7, has_second_floor=$8, has_terrace=$9,
             description=$10, images=$11, floor_plans=$12, url=$13, parsed_at=CURRENT_TIMESTAMP WHERE project_id=$14`,
            [
              projectData.material, projectData.name, projectData.area, projectData.price,
              projectData.bedrooms, projectData.has_kitchen_living, projectData.has_garage,
              projectData.has_second_floor, projectData.has_terrace, projectData.description,
              JSON.stringify(projectData.images), JSON.stringify(projectData.floor_plans || []), projectData.url, projectData.project_id,
            ]
          );
          updated += 1;
        } catch (e) {
          failed.push(projectId);
          console.error(`Reparse project ${projectId}:`, e.message);
        }
        await new Promise((r) => setTimeout(r, 2500 + Math.random() * 1500));
      }
      console.log(`Reparse done: updated ${updated}, failed ${failed.length}`);
    });
  } catch (error) {
    console.error('Error reparse-materials:', error);
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

// GET /api/users - список пользователей для админки
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT telegram_id, username, first_name, last_name, first_visit, last_visit, visit_count, message_count FROM users ORDER BY last_visit DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/users/:id/message - увеличить счётчик сообщений
app.post('/api/users/:id/message', async (req, res) => {
  try {
    const telegramId = parseInt(req.params.id);
    await pool.query(
      'UPDATE users SET message_count = COALESCE(message_count, 0) + 1 WHERE telegram_id = $1',
      [telegramId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating message count:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot is active');
  }
});
