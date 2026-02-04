const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = { pool, initDB };
