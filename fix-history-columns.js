/**
 * Скрипт для переименования колонки number -> nomer в таблицах истории
 */

const { Pool } = require('pg');
require('dotenv').config();

const dbConfig = {
  host: 'autonomera-alex1976.db-msk0.amvera.tech',
  port: 5432,
  user: 'parser_user',
  password: 'Qwerty12345',
  database: 'autonomera777',
  ssl: { rejectUnauthorized: false }
};

console.log(`✓ Подключаемся к: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

const pool = new Pool(dbConfig);

async function fixHistoryColumns() {
  const client = await pool.connect();

  try {
    console.log('🔄 Подключено к БД\n');

    // Проверяем структуру таблиц
    const listingHistory = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'listing_history' AND column_name = 'number'
    `);

    const priceHistory = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'price_history' AND column_name = 'number'
    `);

    console.log('📋 Проверка структуры:');
    console.log(`   listing_history.number: ${listingHistory.rows.length > 0 ? '✓ существует' : '✗ не существует'}`);
    console.log(`   price_history.number: ${priceHistory.rows.length > 0 ? '✓ существует' : '✗ не существует'}\n`);

    // Начало транзакции
    await client.query('BEGIN');

    // Переименовываем колонку в listing_history
    if (listingHistory.rows.length > 0) {
      await client.query('ALTER TABLE listing_history RENAME COLUMN number TO nomer');
      console.log('✓ Колонка listing_history.number переименована в nomer');
    }

    // Переименовываем колонку в price_history
    if (priceHistory.rows.length > 0) {
      await client.query('ALTER TABLE price_history RENAME COLUMN number TO nomer');
      console.log('✓ Колонка price_history.number переименована в nomer');
    }

    // Коммитим транзакцию
    await client.query('COMMIT');

    console.log('\n✅ Операция завершена!');

    // Проверяем структуру после изменений
    const finalCheck = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE (table_name IN ('listing_history', 'price_history'))
      AND column_name IN ('number', 'nomer')
      ORDER BY table_name
    `);

    console.log('\n📊 Финальная проверка:');
    finalCheck.rows.forEach(row => {
      console.log(`   ${row.table_name}.${row.column_name}`);
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Критическая ошибка:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('🚀 Начинаю исправление колонок истории...\n');
fixHistoryColumns().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
