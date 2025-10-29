/**
 * SQLite модуль для локальной разработки
 * Простая замена PostgreSQL/MySQL когда они недоступны
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// База данных в файле
const dbPath = path.join(__dirname, 'autonomera777.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Ошибка открытия БД:', err.message);
  }
});

// Обещание-обертка для выполнения SQL
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Инициализация БД
 */
async function initializeDatabase() {
  console.log(`📁 Использую SQLite БД: ${dbPath}`);

  try {
    // Создаем таблицу listings
    await run(`
      CREATE TABLE IF NOT EXISTS listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT NOT NULL UNIQUE,
        price INTEGER,
        region TEXT,
        status TEXT DEFAULT 'active',
        date_posted DATETIME,
        date_updated DATETIME,
        seller TEXT,
        url TEXT,
        parsed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Создаем индексы для быстрого поиска
    await run(`CREATE INDEX IF NOT EXISTS idx_number ON listings(number)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_price ON listings(price)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_region ON listings(region)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_status ON listings(status)`);

    // Создаем таблицу для истории цен
    await run(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT NOT NULL,
        old_price INTEGER,
        new_price INTEGER,
        price_delta INTEGER,
        change_direction TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        session_id TEXT
      )
    `);

    // Создаем таблицу для логирования сессий парсинга
    await run(`
      CREATE TABLE IF NOT EXISTS parse_sessions (
        id TEXT PRIMARY KEY,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        status TEXT DEFAULT 'running',
        total_items INTEGER DEFAULT 0,
        new_items INTEGER DEFAULT 0,
        updated_items INTEGER DEFAULT 0,
        unchanged_items INTEGER DEFAULT 0,
        error_message TEXT
      )
    `);

    console.log('✅ БД инициализирована');
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error.message);
    throw error;
  }
}

/**
 * Вставка или обновление объявления
 */
async function insertOrUpdateListing(listing) {
  try {
    const existingListing = await get(
      'SELECT id FROM listings WHERE number = ?',
      [listing.number]
    );

    if (existingListing) {
      // UPDATE
      await run(
        `UPDATE listings SET
          price = ?, region = ?, status = ?, date_posted = ?, date_updated = ?,
          seller = ?, url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE number = ?`,
        [listing.price, listing.region, listing.status, listing.datePosted,
         listing.dateUpdated, listing.seller, listing.url, listing.number]
      );
      return { success: true, action: 'updated' };
    } else {
      // INSERT
      await run(
        `INSERT INTO listings (number, price, region, status, date_posted, date_updated, seller, url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [listing.number, listing.price, listing.region, listing.status,
         listing.datePosted, listing.dateUpdated, listing.seller, listing.url]
      );
      return { success: true, action: 'inserted' };
    }
  } catch (error) {
    console.error('Ошибка при сохранении:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Получить объявления с фильтрацией
 */
async function getListings(filters = {}) {
  try {
    let sql = 'SELECT * FROM listings WHERE status = "active"';
    const params = [];

    if (filters.minPrice) {
      sql += ' AND price >= ?';
      params.push(filters.minPrice);
    }

    if (filters.maxPrice && filters.maxPrice !== Infinity) {
      sql += ' AND price <= ?';
      params.push(filters.maxPrice);
    }

    if (filters.region) {
      sql += ' AND region = ?';
      params.push(filters.region);
    }

    sql += ' ORDER BY updated_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const listings = await all(sql, params);
    return listings || [];
  } catch (error) {
    console.error('Ошибка при получении данных:', error.message);
    return [];
  }
}

/**
 * Получить статистику
 */
async function getListingsStats() {
  try {
    const result = await get(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT region) as regionsCount,
        COUNT(DISTINCT seller) as sellersCount,
        AVG(price) as avgPrice,
        MIN(price) as minPrice,
        MAX(price) as maxPrice,
        MAX(updated_at) as lastUpdate
      FROM listings
      WHERE status = 'active'
    `);

    return result || {
      total: 0,
      regionsCount: 0,
      sellersCount: 0,
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      lastUpdate: null
    };
  } catch (error) {
    console.error('Ошибка при получении статистики:', error.message);
    throw error;
  }
}

/**
 * Сохранить данные парсинга в БД
 */
async function saveListingsToDB(listings, sessionId) {
  try {
    let newCount = 0;
    let updatedCount = 0;

    for (const listing of listings) {
      const result = await insertOrUpdateListing(listing);
      if (result.success) {
        if (result.action === 'inserted') newCount++;
        else updatedCount++;
      }
    }

    // Логируем сессию
    await run(
      `INSERT INTO parse_sessions (id, status, total_items, new_items, updated_items)
       VALUES (?, 'completed', ?, ?, ?)`,
      [sessionId, listings.length, newCount, updatedCount]
    );

    return {
      success: true,
      newItems: newCount,
      updatedItems: updatedCount,
      total: listings.length
    };
  } catch (error) {
    console.error('Ошибка при сохранении данных:', error.message);
    throw error;
  }
}

/**
 * Создать или получить сессию парсинга
 */
async function createParseSession(sessionId, params = {}) {
  try {
    await run(
      `INSERT INTO parse_sessions (id, status) VALUES (?, 'running')`,
      [sessionId]
    );
    console.log(`✅ Сессия парсинга создана: ${sessionId}`);
    return sessionId;
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      console.log(`⚠️ Сессия ${sessionId} уже существует`);
      return sessionId;
    }
    throw error;
  }
}

/**
 * Завершить сессию парсинга
 */
async function completeParseSession(sessionId, stats = {}) {
  try {
    await run(
      `UPDATE parse_sessions SET
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        total_items = ?,
        new_items = ?,
        updated_items = ?
      WHERE id = ?`,
      [stats.total || 0, stats.newItems || 0, stats.updatedItems || 0, sessionId]
    );
  } catch (error) {
    console.error('Ошибка при завершении сессии:', error.message);
  }
}

/**
 * Получить дифференциальные объявления (новые и измененные)
 */
async function getDifferentialListings(currentListings, sessionId) {
  try {
    const existingNumbers = await all(
      'SELECT number, price FROM listings ORDER BY number'
    );

    const existingMap = new Map(existingNumbers.map(l => [l.number, l.price]));
    const newListings = [];
    let unchangedCount = 0;
    let updatedCount = 0;

    for (const listing of currentListings) {
      if (!existingMap.has(listing.number)) {
        newListings.push(listing);
      } else {
        const oldPrice = existingMap.get(listing.number);
        if (oldPrice !== listing.price) {
          updatedCount++;
        } else {
          unchangedCount++;
        }
      }
    }

    return {
      newListings,
      statistics: {
        updatedCount,
        unchangedCount,
        totalCount: currentListings.length
      }
    };
  } catch (error) {
    console.error('Ошибка при получении дифференциальных данных:', error.message);
    // Если ошибка, считаем все новыми
    return {
      newListings: currentListings,
      statistics: {
        updatedCount: 0,
        unchangedCount: 0,
        totalCount: currentListings.length
      }
    };
  }
}

/**
 * Закрытие БД
 */
async function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  initializeDatabase,
  insertOrUpdateListing,
  getListings,
  getListingsStats,
  saveListingsToDB,
  createParseSession,
  completeParseSession,
  getDifferentialListings,
  closeDatabase
};
