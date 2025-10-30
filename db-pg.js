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

    // Выполняем миграцию БД (безопасное обновление существующей структуры)
    const { migrateDatabase } = require('./db-migration');
    await migrateDatabase();

    return pool;
  } catch (error) {
    console.error('✗ Ошибка подключения к БД:', error.message);
    throw error;
  }
}

// Функция createTables перемещена в db-migration.js для безопасных миграций

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
        COUNT(DISTINCT TRIM(CAST(region AS TEXT))) as regions_count,
        COUNT(DISTINCT TRIM(CAST(seller AS TEXT))) as sellers_count,
        ROUND(AVG(CAST(TRIM(CAST(price AS TEXT)) AS INTEGER)))::integer as avg_price,
        MIN(CAST(TRIM(CAST(price AS TEXT)) AS INTEGER))::integer as min_price,
        MAX(CAST(TRIM(CAST(price AS TEXT)) AS INTEGER))::integer as max_price,
        DATE(MAX(updated_at)) as last_update
      FROM listings
      WHERE TRIM(CAST(COALESCE(price, '') AS TEXT)) ~ '^[0-9]+$'
    `);

    const stats = result.rows[0] || {};
    return {
      total: parseInt(stats.total) || 0,
      regionsCount: parseInt(stats.regions_count) || 0,
      sellersCount: parseInt(stats.sellers_count) || 0,
      avgPrice: parseInt(stats.avg_price) || 0,
      minPrice: parseInt(stats.min_price) || 0,
      maxPrice: parseInt(stats.max_price) || 0,
      lastUpdate: stats.last_update
    };
  } catch (error) {
    console.error('Ошибка при получении статистики:', error.message);
    return {
      total: 0,
      regionsCount: 0,
      sellersCount: 0,
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      lastUpdate: null
    };
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

/**
 * Получает список всех существующих номеров из БД
 */
async function getExistingNumbers() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT number, price FROM listings WHERE status = 'active'
    `);
    const numbers = {};
    result.rows.forEach(row => {
      numbers[row.number] = row.price;
    });
    return numbers;
  } catch (error) {
    console.error('Ошибка при получении существующих номеров:', error.message);
    return {};
  } finally {
    client.release();
  }
}

/**
 * Проверяет наличие номера в БД и возвращает старую цену
 */
async function getListingByNumber(number) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM listings WHERE number = $1',
      [number]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Ошибка при получении объявления:', error.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Записывает изменение цены в историю
 */
async function recordPriceChange(number, oldPrice, newPrice, sessionId) {
  const client = await pool.connect();
  try {
    const priceDelta = newPrice - oldPrice;
    const changeDirection = priceDelta > 0 ? 'increased' : priceDelta < 0 ? 'decreased' : 'unchanged';

    await client.query(`
      INSERT INTO price_history (number, old_price, new_price, price_delta, change_direction, session_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [number, oldPrice, newPrice, priceDelta, changeDirection, sessionId]);

    return {
      number,
      oldPrice,
      newPrice,
      priceDelta,
      changeDirection
    };
  } catch (error) {
    console.error('Ошибка при записи изменения цены:', error.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Получает историю изменений цен для номера
 */
async function getPriceHistory(number, limit = 10) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM price_history
      WHERE number = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `, [number, limit]);
    return result.rows;
  } catch (error) {
    console.error('Ошибка при получении истории цен:', error.message);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Получает все изменения цен за последние N дней
 */
async function getRecentPriceChanges(days = 7, limit = 1000) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM price_history
      WHERE updated_at >= NOW() - INTERVAL '${days} days'
      ORDER BY updated_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  } catch (error) {
    console.error('Ошибка при получении недавних изменений цен:', error.message);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Сравнивает новые данные с существующими и возвращает только новые/измененные
 */
async function getDifferentialListings(newListings, sessionId) {
  const existingNumbers = await getExistingNumbers();
  const newListingsArray = [];
  const priceChanges = [];
  let newCount = 0;
  let updatedCount = 0;

  for (const listing of newListings) {
    const existingPrice = existingNumbers[listing.number];

    if (existingPrice === undefined) {
      // Новое объявление
      newListingsArray.push(listing);
      newCount++;
    } else if (listing.price !== existingPrice) {
      // Цена изменилась
      const priceChange = await recordPriceChange(
        listing.number,
        existingPrice,
        listing.price,
        sessionId
      );
      if (priceChange) {
        priceChanges.push(priceChange);
      }
      updatedCount++;
    }
  }

  return {
    newListings: newListingsArray,
    priceChanges: priceChanges,
    statistics: {
      newCount: newCount,
      updatedCount: updatedCount,
      unchangedCount: newListings.length - newCount - updatedCount,
      totalProcessed: newListings.length
    }
  };
}

/**
 * Получает статистику по изменениям цен
 */
async function getPriceChangeStats(days = 7) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*) as total_changes,
        COUNT(CASE WHEN change_direction = 'increased' THEN 1 END) as increased,
        COUNT(CASE WHEN change_direction = 'decreased' THEN 1 END) as decreased,
        COUNT(CASE WHEN change_direction = 'unchanged' THEN 1 END) as unchanged,
        ROUND(AVG(price_delta)::numeric, 2) as avg_delta,
        MIN(price_delta) as min_delta,
        MAX(price_delta) as max_delta
      FROM price_history
      WHERE updated_at >= NOW() - INTERVAL '${days} days'
    `);

    const stats = result.rows[0];
    return {
      totalChanges: parseInt(stats.total_changes || 0),
      increased: parseInt(stats.increased || 0),
      decreased: parseInt(stats.decreased || 0),
      unchanged: parseInt(stats.unchanged || 0),
      avgDelta: parseFloat(stats.avg_delta || 0),
      minDelta: parseInt(stats.min_delta || 0),
      maxDelta: parseInt(stats.max_delta || 0)
    };
  } catch (error) {
    console.error('Ошибка при получении статистики цен:', error.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Умный upsert с логикой сравнения дат и цен
 * Сохраняет в историю только изменения, если дата обновления возросла
 */
async function smartUpsertListing(listingData, sessionId) {
  const client = await pool.connect();
  try {
    const {
      number, price, region, status, datePosted, dateUpdated, seller, url
    } = listingData;

    // 1. Получаем текущую запись по номеру
    const existing = await client.query(
      'SELECT id, price as current_price, date_updated as last_site_update FROM listings WHERE number = $1',
      [number]
    );

    let listingId;
    const prevPrice = existing.rowCount > 0 ? existing.rows[0].current_price : null;
    const prevDateUpdated = existing.rowCount > 0 ? existing.rows[0].last_site_update : null;

    // 2. Вставляем или обновляем основную таблицу
    const result = await client.query(`
      INSERT INTO listings (number, price, region, status, date_posted, date_updated, seller, url, parsed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (number) DO UPDATE SET
        price = EXCLUDED.price,
        status = EXCLUDED.status,
        date_updated = EXCLUDED.date_updated,
        parsed_at = NOW()
      RETURNING id
    `, [number, price, region, status, datePosted, dateUpdated, seller, url]);

    listingId = result.rows[0].id;

    // 3. Проверяем: есть ли история, нужно ли писать
    const newDateUpdated = dateUpdated ? new Date(dateUpdated) : null;
    const oldDateUpdated = prevDateUpdated ? new Date(prevDateUpdated) : null;

    // Если даты нет в новых данных - не записываем историю
    if (!newDateUpdated) return { listingId, newEntry: existing.rowCount === 0 };

    // Если есть предыдущая дата и она >= новой - не записываем (нет роста даты)
    if (oldDateUpdated && newDateUpdated <= oldDateUpdated) {
      return { listingId, newEntry: false, reason: 'date_not_increased' };
    }

    // 4. Логика написания истории: дата обновления выросла
    const priceChanged = prevPrice !== null && Number(price) !== Number(prevPrice);
    const priceDelta = priceChanged ? Number(price) - Number(prevPrice) : null;
    const changeDir = priceChanged ? (priceDelta > 0 ? 'increased' : 'decreased') : null;

    // Записываем в историю
    await client.query(`
      INSERT INTO listing_history
      (number, old_price, new_price, price_delta, change_direction, date_updated_site, is_price_changed, session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      number,
      prevPrice || price,
      price,
      priceDelta,
      changeDir,
      dateUpdated,
      priceChanged,
      sessionId
    ]);

    return {
      listingId,
      newEntry: existing.rowCount === 0,
      priceChanged,
      priceDelta,
      historyRecorded: true
    };
  } catch (error) {
    console.error('Ошибка при smartUpsertListing:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Получить последнее изменение цены для номера (если было)
 */
async function getLastPriceChange(number) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT price_delta, date_updated_site, recorded_at
      FROM listing_history
      WHERE number = $1 AND is_price_changed = TRUE
      ORDER BY recorded_at DESC
      LIMIT 1
    `, [number]);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Ошибка при getLastPriceChange:', error.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Получить список данных из БД для отображения в HTML
 * с включением последнего изменения цены
 */
async function getListingsWithHistory(filters = {}) {
  const client = await pool.connect();
  try {
    let query = `
      SELECT
        l.id,
        l.number,
        l.price,
        l.region,
        l.status,
        l.date_posted,
        l.date_updated,
        l.seller,
        l.url,
        l.parsed_at,
        l.updated_at,
        (
          SELECT json_build_object(
            'price_delta', lh.price_delta,
            'date_updated_site', lh.date_updated_site,
            'recorded_at', lh.recorded_at,
            'is_price_changed', lh.is_price_changed
          )
          FROM listing_history lh
          WHERE lh.number = l.number
          ORDER BY lh.recorded_at DESC
          LIMIT 1
        ) as last_change
      FROM listings l
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.region) {
      query += ` AND l.region = $${paramIndex}`;
      params.push(filters.region);
      paramIndex++;
    }
    if (filters.minPrice !== undefined) {
      query += ` AND l.price >= $${paramIndex}`;
      params.push(filters.minPrice);
      paramIndex++;
    }
    if (filters.maxPrice !== undefined) {
      query += ` AND l.price <= $${paramIndex}`;
      params.push(filters.maxPrice);
      paramIndex++;
    }
    if (filters.status) {
      query += ` AND l.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    query += ` ORDER BY l.date_updated DESC NULLS LAST LIMIT $${paramIndex}`;
    params.push(filters.limit || 10000);

    const result = await client.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Ошибка при getListingsWithHistory:', error.message);
    return [];
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
  clearAllData,
  getExistingNumbers,
  getListingByNumber,
  recordPriceChange,
  getPriceHistory,
  getRecentPriceChanges,
  getDifferentialListings,
  getPriceChangeStats,
  smartUpsertListing,
  getLastPriceChange,
  getListingsWithHistory
};
