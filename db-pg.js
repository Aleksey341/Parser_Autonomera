/**
 * PostgreSQL модуль для работы с БД
 * Версия для Amvera и других PostgreSQL хостинг-провайдеров
 */

const { Pool } = require('pg');
require('dotenv').config();

// Пул подключений к БД
let pool;

async function initializeDatabase() {
  try {
    // Парсим DATABASE_URL если он есть (Amvera использует это)
    let dbConfig = {};

    if (process.env.DATABASE_URL) {
      // Amvera предоставляет DATABASE_URL в формате:
      // postgresql://user:password@host:port/database
      dbConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      };
      console.log('✓ Используем DATABASE_URL от Amvera');
    } else {
      // Локальное подключение
      dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'autonomera777',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      };
    }

    pool = new Pool(dbConfig);

    // Тестирование подключения
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✓ База данных подключена успешно');
    console.log(`✓ Время сервера БД: ${result.rows[0].now}`);
    client.release();

    // Создание таблиц если их нет
    await createTables();

    return pool;
  } catch (error) {
    console.error('✗ Ошибка подключения к БД:', error.message);
    throw error;
  }
}

async function createTables() {
  const client = await pool.connect();
  try {
    // Таблица объявлений
    await client.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        number VARCHAR(15) UNIQUE NOT NULL,
        price INTEGER,
        region VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        date_posted TIMESTAMP,
        date_updated TIMESTAMP,
        seller VARCHAR(255),
        url VARCHAR(500) UNIQUE,
        parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_listings_region ON listings(region);
      CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
      CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
      CREATE INDEX IF NOT EXISTS idx_listings_updated_at ON listings(updated_at);
      CREATE INDEX IF NOT EXISTS idx_listings_parsed_at ON listings(parsed_at);
    `);

    // Таблица для отслеживания сессий парсинга
    await client.query(`
      CREATE TABLE IF NOT EXISTS parse_sessions (
        id VARCHAR(36) PRIMARY KEY,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        status VARCHAR(50) DEFAULT 'running',
        total_items INTEGER DEFAULT 0,
        new_items INTEGER DEFAULT 0,
        updated_items INTEGER DEFAULT 0,
        params JSONB,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON parse_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON parse_sessions(started_at);
    `);

    // Таблица для логирования регулярных обновлений
    await client.query(`
      CREATE TABLE IF NOT EXISTS cron_logs (
        id SERIAL PRIMARY KEY,
        scheduled_time TIMESTAMP,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        status VARCHAR(50) DEFAULT 'running',
        items_processed INTEGER DEFAULT 0,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cron_started_at ON cron_logs(started_at);
      CREATE INDEX IF NOT EXISTS idx_cron_status ON cron_logs(status);
    `);

    console.log('✓ Таблицы созданы/проверены');
  } catch (error) {
    console.error('✗ Ошибка при создании таблиц:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Функции для работы с БД

async function insertOrUpdateListing(listingData) {
  const client = await pool.connect();
  try {
    const {
      number, price, region, status, datePosted, dateUpdated, seller, url
    } = listingData;

    // PostgreSQL не имеет ON DUPLICATE KEY UPDATE,
    // используем ON CONFLICT ... DO UPDATE вместо этого
    await client.query(`
      INSERT INTO listings (number, price, region, status, date_posted, date_updated, seller, url, parsed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (number) DO UPDATE SET
        price = EXCLUDED.price,
        status = EXCLUDED.status,
        date_updated = EXCLUDED.date_updated,
        parsed_at = NOW()
    `, [number, price, region, status, datePosted, dateUpdated, seller, url]);

    return true;
  } catch (error) {
    console.error('Ошибка при вставке/обновлении:', error.message);
    return false;
  } finally {
    client.release();
  }
}

async function getListings(filters = {}) {
  const client = await pool.connect();
  try {
    let query = 'SELECT * FROM listings WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.region) {
      query += ` AND region = $${paramIndex}`;
      params.push(filters.region);
      paramIndex++;
    }
    if (filters.minPrice !== undefined) {
      query += ` AND price >= $${paramIndex}`;
      params.push(filters.minPrice);
      paramIndex++;
    }
    if (filters.maxPrice !== undefined) {
      query += ` AND price <= $${paramIndex}`;
      params.push(filters.maxPrice);
      paramIndex++;
    }
    if (filters.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex}`;
    params.push(filters.limit || 10000);

    const result = await client.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Ошибка при получении данных:', error.message);
    return [];
  } finally {
    client.release();
  }
}

async function getListingsStats() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT region) as regions_count,
        COUNT(DISTINCT seller) as sellers_count,
        ROUND(AVG(price)::numeric) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        DATE(MAX(updated_at)) as last_update
      FROM listings
      WHERE status = 'active'
    `);

    const stats = result.rows[0];
    return {
      total: parseInt(stats.total),
      regionsCount: parseInt(stats.regions_count),
      sellersCount: parseInt(stats.sellers_count),
      avgPrice: parseInt(stats.avg_price) || 0,
      minPrice: parseInt(stats.min_price) || 0,
      maxPrice: parseInt(stats.max_price) || 0,
      lastUpdate: stats.last_update
    };
  } catch (error) {
    console.error('Ошибка при получении статистики:', error.message);
    return null;
  } finally {
    client.release();
  }
}

async function createParseSession(sessionId, params) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO parse_sessions (id, params, status)
      VALUES ($1, $2, 'running')
    `, [sessionId, JSON.stringify(params)]);
  } catch (error) {
    console.error('Ошибка при создании сессии:', error.message);
  } finally {
    client.release();
  }
}

async function updateParseSession(sessionId, data) {
  const client = await pool.connect();
  try {
    let query = 'UPDATE parse_sessions SET ';
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (data.status) {
      updates.push(`status = $${paramIndex}`);
      params.push(data.status);
      paramIndex++;
    }
    if (data.totalItems !== undefined) {
      updates.push(`total_items = $${paramIndex}`);
      params.push(data.totalItems);
      paramIndex++;
    }
    if (data.newItems !== undefined) {
      updates.push(`new_items = $${paramIndex}`);
      params.push(data.newItems);
      paramIndex++;
    }
    if (data.updatedItems !== undefined) {
      updates.push(`updated_items = $${paramIndex}`);
      params.push(data.updatedItems);
      paramIndex++;
    }
    if (data.error) {
      updates.push(`error = $${paramIndex}`);
      params.push(data.error);
      paramIndex++;
    }
    if (data.status === 'completed') {
      updates.push('completed_at = NOW()');
    }

    if (updates.length === 0) return;

    query += updates.join(', ') + ` WHERE id = $${paramIndex}`;
    params.push(sessionId);

    await client.query(query, params);
  } catch (error) {
    console.error('Ошибка при обновлении сессии:', error.message);
  } finally {
    client.release();
  }
}

async function deleteOldData(daysOld = 30) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      DELETE FROM listings
      WHERE status = 'inactive'
      AND updated_at < NOW() - INTERVAL '1 day' * $1
    `, [daysOld]);
    console.log(`✓ Удалено старых записей: ${result.rowCount}`);
    return result.rowCount;
  } catch (error) {
    console.error('Ошибка при удалении старых данных:', error.message);
  } finally {
    client.release();
  }
}

async function clearAllData() {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM listings');
    console.log('✓ Все данные очищены');
  } catch (error) {
    console.error('Ошибка при очистке:', error.message);
  } finally {
    client.release();
  }
}

module.exports = {
  initializeDatabase,
  pool: () => pool,
  insertOrUpdateListing,
  getListings,
  getListingsStats,
  createParseSession,
  updateParseSession,
  deleteOldData,
  clearAllData
};
