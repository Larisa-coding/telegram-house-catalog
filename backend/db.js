const { Pool } = require('pg');
require('dotenv').config();

const connectionString =
  process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn(
    'Missing DATABASE_URL / DATABASE_PUBLIC_URL. Database connection will fail until you set one of them.'
  );
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Инициализация таблицы
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        project_id INTEGER UNIQUE NOT NULL,
        name VARCHAR(500),
        area DECIMAL(10, 2),
        material VARCHAR(100),
        price DECIMAL(15, 2),
        bedrooms INTEGER,
        has_kitchen_living BOOLEAN DEFAULT false,
        has_garage BOOLEAN DEFAULT false,
        has_second_floor BOOLEAN DEFAULT false,
        has_terrace BOOLEAN DEFAULT false,
        description TEXT,
        images JSONB DEFAULT '[]'::jsonb,
        floor_plans JSONB DEFAULT '[]'::jsonb,
        url TEXT,
        parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        posted_to_channel BOOLEAN DEFAULT false
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_project_id ON projects(project_id);
      CREATE INDEX IF NOT EXISTS idx_material ON projects(material);
      CREATE INDEX IF NOT EXISTS idx_area ON projects(area);
    `);

    await pool.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS floor_plans JSONB DEFAULT '[]'::jsonb
    `);

    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        first_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        visit_count INTEGER DEFAULT 1,
        message_count INTEGER DEFAULT 0
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telegram_id ON users(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_username ON users(username);
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = { pool, initDB };
