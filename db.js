const mysql = require('mysql2/promise');
require('dotenv').config();

// Пул подключений к БД
let pool;

async function initializeDatabase() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'autonomera777',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelayMs: 0
    });

    // Тестирование подключения
    const connection = await pool.getConnection();
    console.log('✓ База данных подключена успешно');
    connection.release();

    // Создание таблиц если их нет
    await createTables();

    return pool;
  } catch (error) {
    console.error('✗ Ошибка подключения к БД:', error.message);
    throw error;
  }
}

async function createTables() {
  const connection = await pool.getConnection();
  try {
    // Таблица объявлений
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS listings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        number VARCHAR(15) UNIQUE NOT NULL COMMENT 'Номер автомобиля',
        price INT COMMENT 'Цена в рублях',
        region VARCHAR(100) COMMENT 'Регион',
        status VARCHAR(50) DEFAULT 'active' COMMENT 'Статус объявления',
        datePosted DATETIME COMMENT 'Дата размещения',
        dateUpdated DATETIME COMMENT 'Дата обновления',
        seller VARCHAR(255) COMMENT 'ФИО продавца/ID',
        url VARCHAR(500) UNIQUE COMMENT 'Ссылка на объявление',
        parsedAt DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Когда данные были спарсены',
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Когда запись была обновлена',
        INDEX idx_region (region),
        INDEX idx_status (status),
        INDEX idx_updatedAt (updatedAt),
        INDEX idx_parsedAt (parsedAt),
        INDEX idx_price (price)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Таблица для отслеживания сессий парсинга
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS parse_sessions (
        id VARCHAR(36) PRIMARY KEY,
        startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME NULL,
        status VARCHAR(50) DEFAULT 'running' COMMENT 'running, completed, failed',
        totalItems INT DEFAULT 0,
        newItems INT DEFAULT 0,
        updatedItems INT DEFAULT 0,
        params JSON COMMENT 'Параметры парсинга',
        error TEXT COMMENT 'Ошибка если было',
        INDEX idx_status (status),
        INDEX idx_startedAt (startedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Таблица для логирования регулярных обновлений
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cron_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scheduledTime DATETIME,
        startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME NULL,
        status VARCHAR(50) DEFAULT 'running' COMMENT 'running, completed, failed',
        itemsProcessed INT DEFAULT 0,
        error TEXT,
        INDEX idx_startedAt (startedAt),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✓ Таблицы созданы/проверены');
  } catch (error) {
    console.error('✗ Ошибка при создании таблиц:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

// Функции для работы с БД

async function insertOrUpdateListing(listingData) {
  const connection = await pool.getConnection();
  try {
    const {
      number, price, region, status, datePosted, dateUpdated, seller, url
    } = listingData;

    await connection.execute(`
      INSERT INTO listings (number, price, region, status, datePosted, dateUpdated, seller, url, parsedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        price = VALUES(price),
        status = VALUES(status),
        dateUpdated = VALUES(dateUpdated),
        parsedAt = NOW()
    `, [number, price, region, status, datePosted, dateUpdated, seller, url]);

    return true;
  } catch (error) {
    console.error('Ошибка при вставке/обновлении:', error.message);
    return false;
  } finally {
    connection.release();
  }
}

async function getListings(filters = {}) {
  const connection = await pool.getConnection();
  try {
    let query = 'SELECT * FROM listings WHERE 1=1';
    const params = [];

    if (filters.region) {
      query += ' AND region = ?';
      params.push(filters.region);
    }
    if (filters.minPrice !== undefined) {
      query += ' AND price >= ?';
      params.push(filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      query += ' AND price <= ?';
      params.push(filters.maxPrice);
    }
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY updatedAt DESC LIMIT ?';
    params.push(filters.limit || 10000);

    const [rows] = await connection.execute(query, params);
    return rows;
  } catch (error) {
    console.error('Ошибка при получении данных:', error.message);
    return [];
  } finally {
    connection.release();
  }
}

async function getListingsStats() {
  const connection = await pool.getConnection();
  try {
    const [stats] = await connection.execute(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT region) as regionsCount,
        COUNT(DISTINCT seller) as sellersCount,
        AVG(price) as avgPrice,
        MIN(price) as minPrice,
        MAX(price) as maxPrice,
        DATE(MAX(updatedAt)) as lastUpdate
      FROM listings
      WHERE status = 'active'
    `);
    return stats[0];
  } catch (error) {
    console.error('Ошибка при получении статистики:', error.message);
    return null;
  } finally {
    connection.release();
  }
}

async function createParseSession(sessionId, params) {
  const connection = await pool.getConnection();
  try {
    await connection.execute(`
      INSERT INTO parse_sessions (id, params, status)
      VALUES (?, ?, 'running')
    `, [sessionId, JSON.stringify(params)]);
  } catch (error) {
    console.error('Ошибка при создании сессии:', error.message);
  } finally {
    connection.release();
  }
}

async function updateParseSession(sessionId, data) {
  const connection = await pool.getConnection();
  try {
    let query = 'UPDATE parse_sessions SET ';
    const updates = [];
    const params = [];

    if (data.status) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.totalItems !== undefined) {
      updates.push('totalItems = ?');
      params.push(data.totalItems);
    }
    if (data.newItems !== undefined) {
      updates.push('newItems = ?');
      params.push(data.newItems);
    }
    if (data.updatedItems !== undefined) {
      updates.push('updatedItems = ?');
      params.push(data.updatedItems);
    }
    if (data.error) {
      updates.push('error = ?');
      params.push(data.error);
    }
    if (data.status === 'completed') {
      updates.push('completedAt = NOW()');
    }

    if (updates.length === 0) return;

    query += updates.join(', ') + ' WHERE id = ?';
    params.push(sessionId);

    await connection.execute(query, params);
  } catch (error) {
    console.error('Ошибка при обновлении сессии:', error.message);
  } finally {
    connection.release();
  }
}

async function deleteOldData(daysOld = 30) {
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute(`
      DELETE FROM listings
      WHERE status = 'inactive'
      AND updatedAt < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [daysOld]);
    console.log(`✓ Удалено старых записей: ${result[0].affectedRows}`);
    return result[0].affectedRows;
  } catch (error) {
    console.error('Ошибка при удалении старых данных:', error.message);
  } finally {
    connection.release();
  }
}

async function clearAllData() {
  const connection = await pool.getConnection();
  try {
    await connection.execute('DELETE FROM listings');
    console.log('✓ Все данные очищены');
  } catch (error) {
    console.error('Ошибка при очистке:', error.message);
  } finally {
    connection.release();
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
