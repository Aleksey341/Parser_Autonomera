/**
 * ============================================================================
 * Модуль подключения к PostgreSQL
 * ============================================================================
 */

const { Pool } = require('pg');
const path = require('path');

// Конфигурация пула подключений
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,  // Максимум подключений в пуле
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Обработчик ошибок пула
pool.on('error', (err) => {
  console.error('❌ Неожиданная ошибка в пуле PostgreSQL:', err);
  process.exit(-1);
});

// Проверка подключения при старте
pool.on('connect', () => {
  console.log('✅ PostgreSQL пул: новое подключение');
});

/**
 * Инициализация БД при старте приложения
 */
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    try {
      console.log('📊 Инициализация схемы БД...');

      // Проверяем существование таблиц
      const tablesResult = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'dim_municipalities'
      `);

      if (tablesResult.rows.length === 0) {
        console.log('⚠️ Таблицы не найдены. Требуется выполнить SQL-миграции:');
        console.log('   npm run db:init');
        console.log('   npm run db:seed');
        return false;
      }

      // Проверяем количество МО
      const moResult = await client.query('SELECT COUNT(*) FROM dim_municipalities');
      const moCount = parseInt(moResult.rows[0].count);

      console.log(`✅ БД инициализирована: ${moCount} МО найдено`);
      return true;

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error.message);
    throw error;
  }
}

/**
 * Экспортируем пул для использования в приложении
 */
module.exports = pool;
module.exports.initializeDatabase = initializeDatabase;
