/**
 * Скрипт для удаления неиспользуемых колонок из таблицы listings
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

async function dropColumns() {
  const client = await pool.connect();

  try {
    console.log('🔄 Подключено к БД');

    // Проверяем наличие колонок перед удалением
    const checkColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'listings'
      AND column_name IN ('number', 'seller')
    `);

    if (checkColumns.rows.length === 0) {
      console.log('ℹ️  Колонки number и seller уже удалены или не существуют');
      return;
    }

    console.log(`📋 Найдено колонок для удаления: ${checkColumns.rows.length}`);
    checkColumns.rows.forEach(row => {
      console.log(`   - ${row.column_name}`);
    });

    // Начало транзакции
    await client.query('BEGIN');

    // Удаляем колонку number если она существует
    try {
      await client.query('ALTER TABLE listings DROP COLUMN IF EXISTS number');
      console.log('✓ Колонка number удалена');
    } catch (error) {
      console.log(`⚠️  Ошибка при удалении number: ${error.message}`);
    }

    // Удаляем колонку seller если она существует
    try {
      await client.query('ALTER TABLE listings DROP COLUMN IF EXISTS seller');
      console.log('✓ Колонка seller удалена');
    } catch (error) {
      console.log(`⚠️  Ошибка при удалении seller: ${error.message}`);
    }

    // Коммитим транзакцию
    await client.query('COMMIT');

    // Проверяем структуру таблицы после изменений
    const finalStructure = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'listings'
      ORDER BY ordinal_position
    `);

    console.log('\n✅ Операция завершена!');
    console.log('\n📊 Текущая структура таблицы listings:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    finalStructure.rows.forEach(row => {
      const colName = row.column_name.padEnd(20);
      console.log(`  ${colName} | ${row.data_type}`);
    });
    console.log(`\nВсего колонок: ${finalStructure.rows.length}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Критическая ошибка:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('🚀 Начинаю удаление неиспользуемых колонок...\n');
dropColumns().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
