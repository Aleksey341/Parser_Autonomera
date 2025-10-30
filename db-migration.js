/**
 * Миграционный скрипт для обновления БД с новыми полями
 * Безопасно добавляет недостающие колонки к существующим таблицам
 */

const { Pool } = require('pg');
require('dotenv').config();

async function migrateDatabase() {
  let dbConfig = {};

  if (process.env.DATABASE_URL) {
    dbConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
  } else {
    dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'autonomera777',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
  }

  const pool = new Pool(dbConfig);
  const client = await pool.connect();

  try {
    console.log('🔄 Начинаем миграцию БД...');

    // 1. Добавляем недостающие колонки в listings
    console.log('  ├─ Проверяем таблицу listings...');
    await client.query(`
      ALTER TABLE listings
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('  ├─ ✓ Колонка updated_at добавлена (если не было)');

    await client.query(`
      ALTER TABLE listings
      ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('  ├─ ✓ Колонка parsed_at добавлена (если не было)');

    await client.query(`
      ALTER TABLE listings
      ADD COLUMN IF NOT EXISTS date_posted TIMESTAMP;
    `);
    console.log('  ├─ ✓ Колонка date_posted добавлена (если не было)');

    await client.query(`
      ALTER TABLE listings
      ADD COLUMN IF NOT EXISTS date_updated TIMESTAMP;
    `);
    console.log('  ├─ ✓ Колонка date_updated добавлена (если не было)');

    // 2. Пересоздаем индексы (IF NOT EXISTS защищает от ошибок)
    console.log('  ├─ Создаем индексы для listings...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_listings_region ON listings(region);
      CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
      CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
      CREATE INDEX IF NOT EXISTS idx_listings_updated_at ON listings(updated_at);
      CREATE INDEX IF NOT EXISTS idx_listings_parsed_at ON listings(parsed_at);
    `);
    console.log('  ├─ ✓ Индексы listings готовы');

    // 3. Создаем таблицу parse_sessions если не существует
    console.log('  ├─ Проверяем таблицу parse_sessions...');
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
    `);
    console.log('  ├─ ✓ Таблица parse_sessions готова');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON parse_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON parse_sessions(started_at);
    `);

    // 4. Создаем таблицу listing_history если не существует
    console.log('  ├─ Проверяем таблицу listing_history...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS listing_history (
        id SERIAL PRIMARY KEY,
        number VARCHAR(15) NOT NULL,
        old_price INTEGER,
        new_price INTEGER,
        price_delta INTEGER,
        change_direction VARCHAR(20),
        date_updated_site TIMESTAMP,
        is_price_changed BOOLEAN DEFAULT FALSE,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        session_id VARCHAR(36)
      );
    `);
    console.log('  ├─ ✓ Таблица listing_history готова');

    // Добавляем индексы
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_listing_history_number ON listing_history(number);
      CREATE INDEX IF NOT EXISTS idx_listing_history_recorded_at ON listing_history(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_listing_history_session ON listing_history(session_id);
      CREATE INDEX IF NOT EXISTS idx_listing_history_date_updated ON listing_history(date_updated_site);
    `);

    // 5. Создаем таблицу price_history если не существует
    console.log('  ├─ Проверяем таблицу price_history...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        number VARCHAR(15) NOT NULL,
        old_price INTEGER,
        new_price INTEGER,
        price_delta INTEGER,
        change_direction VARCHAR(20),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        session_id VARCHAR(36)
      );
    `);
    console.log('  ├─ ✓ Таблица price_history готова');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_history_number ON price_history(number);
      CREATE INDEX IF NOT EXISTS idx_price_history_updated_at ON price_history(updated_at);
      CREATE INDEX IF NOT EXISTS idx_price_history_session ON price_history(session_id);
    `);

    // 6. Создаем таблицу cron_logs если не существует
    console.log('  ├─ Проверяем таблицу cron_logs...');
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
    `);
    console.log('  └─ ✓ Таблица cron_logs готова');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cron_started_at ON cron_logs(started_at);
      CREATE INDEX IF NOT EXISTS idx_cron_status ON cron_logs(status);
    `);

    console.log('✅ Миграция БД успешно завершена!');
    console.log('   Все таблицы и индексы готовы к работе\n');

  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    if (error.code === '42703') {
      console.error('   (Колонка не существует)');
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Запуск миграции если вызвано как скрипт
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('✅ Миграция завершена успешно');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка миграции:', error);
      process.exit(1);
    });
}

module.exports = { migrateDatabase };
