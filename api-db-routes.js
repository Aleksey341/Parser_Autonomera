/**
 * API маршруты для работы с БД
 * Эти маршруты работают с данными из MySQL БД вместо памяти
 */

const express = require('express');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');
const db = require('./db');
const iconv = require('iconv-lite');

const router = express.Router();

/**
 * GET /api/data - получить все объявления из БД
 */
router.get('/data', async (req, res) => {
  try {
    const {
      minPrice = 0,
      maxPrice = 999999999,
      region = null,
      limit = 10000,
      offset = 0,
      sort = 'updatedAt',
      order = 'DESC'
    } = req.query;

    const filters = {
      minPrice: parseInt(minPrice),
      maxPrice: parseInt(maxPrice),
      limit: Math.min(parseInt(limit), 50000) // Максимум 50k за раз
    };

    if (region && region !== 'null' && region !== '') {
      filters.region = region;
    }

    const listings = await db.getListings(filters);

    res.json({
      success: true,
      count: listings.length,
      data: listings
    });
  } catch (error) {
    console.error('Ошибка при получении данных:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/statistics - получить статистику из БД
 */
router.get('/statistics', async (req, res) => {
  try {
    const stats = await db.getListingsStats();

    res.json({
      success: true,
      statistics: {
        total: stats?.total || 0,
        regionsCount: stats?.regionsCount || 0,
        sellersCount: stats?.sellersCount || 0,
        avgPrice: stats?.avgPrice ? Math.round(stats.avgPrice) : 0,
        minPrice: stats?.minPrice || 0,
        maxPrice: stats?.maxPrice || 0,
        lastUpdate: stats?.lastUpdate || null
      }
    });
  } catch (error) {
    console.error('Ошибка при получении статистики:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/export - экспортировать данные из БД в CSV/JSON
 */
router.get('/export', async (req, res) => {
  try {
    const {
      format = 'csv',
      minPrice = 0,
      maxPrice = 999999999,
      region = null
    } = req.query;

    const filters = {
      minPrice: parseInt(minPrice),
      maxPrice: parseInt(maxPrice),
      limit: 1000000 // Большое число для экспорта
    };

    if (region && region !== 'null' && region !== '') {
      filters.region = region;
    }

    const listings = await db.getListings(filters);

    if (format === 'json') {
      // JSON экспорт
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="autonomera777_${new Date().toISOString().split('T')[0]}.json"`);

      res.json(listings);
    } else {
      // CSV экспорт с правильной кодировкой русского текста
      const csvData = stringify(listings, {
        header: true,
        columns: ['number', 'price', 'region', 'status', 'datePosted', 'dateUpdated', 'seller', 'url', 'updatedAt'],
        cast: {
          string: (value) => value === null ? '' : String(value)
        }
      });

      // Кодируем в UTF-8 с BOM для корректного открытия в Excel
      const utf8BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
      const csvBuffer = Buffer.concat([utf8BOM, Buffer.from(csvData, 'utf-8')]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="autonomera777_${new Date().toISOString().split('T')[0]}.csv"`);

      res.send(csvBuffer);
    }
  } catch (error) {
    console.error('Ошибка при экспорте:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/db/status - статус подключения к БД
 */
router.get('/db/status', async (req, res) => {
  try {
    const pool = db.pool();
    const connection = await pool.getConnection();

    // Проверяем подключение
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM listings');
    const listingsCount = rows[0].count;

    const [sessionRows] = await connection.execute('SELECT COUNT(*) as count FROM parse_sessions WHERE status = "completed"');
    const sessionsCount = sessionRows[0].count;

    connection.release();

    res.json({
      success: true,
      database: {
        connected: true,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        listingsCount: listingsCount,
        completedSessions: sessionsCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Ошибка проверки БД:', error.message);
    res.status(500).json({
      success: false,
      error: 'Ошибка подключения к БД',
      message: error.message
    });
  }
});

/**
 * GET /api/parse-sessions - список всех сессий парсинга
 */
router.get('/parse-sessions', async (req, res) => {
  try {
    const pool = db.pool();
    const connection = await pool.getConnection();

    const [sessions] = await connection.execute(`
      SELECT
        id,
        startedAt,
        completedAt,
        status,
        totalItems,
        newItems,
        updatedItems,
        error
      FROM parse_sessions
      ORDER BY startedAt DESC
      LIMIT 50
    `);

    connection.release();

    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Ошибка при получении сессий:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cron-logs - логи автоматических обновлений
 */
router.get('/cron-logs', async (req, res) => {
  try {
    const pool = db.pool();
    const connection = await pool.getConnection();

    const [logs] = await connection.execute(`
      SELECT
        id,
        scheduledTime,
        startedAt,
        completedAt,
        status,
        itemsProcessed,
        error
      FROM cron_logs
      ORDER BY startedAt DESC
      LIMIT 100
    `);

    connection.release();

    res.json({
      success: true,
      logs: logs
    });
  } catch (error) {
    console.error('Ошибка при получении логов:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/data/clear - очистить всю БД (только для разработки!)
 */
router.delete('/data/clear', async (req, res) => {
  // Проверяем, что это разработка
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Невозможно удалить данные в production'
    });
  }

  try {
    await db.clearAllData();
    res.json({
      success: true,
      message: 'Все данные очищены'
    });
  } catch (error) {
    console.error('Ошибка при очистке:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/data/old - удалить старые данные
 */
router.delete('/data/old', async (req, res) => {
  try {
    const daysOld = parseInt(req.query.days || '30');
    const deleted = await db.deleteOldData(daysOld);

    res.json({
      success: true,
      deleted: deleted,
      message: `Удалено ${deleted} записей старше ${daysOld} дней`
    });
  } catch (error) {
    console.error('Ошибка при удалении старых данных:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
