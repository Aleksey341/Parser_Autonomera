/**
 * Скрипт для исправления существующих данных в БД
 * Перемещает date_created -> date_posted (дата размещения)
 * Сохраняет date_updated как есть (дата поднятия)
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

async function fixDates() {
  const client = await pool.connect();

  try {
    console.log('🔄 Подключено к БД\n');

    // Проверяем, что есть дата в date_created
    const checkResult = await client.query(`
      SELECT COUNT(*) as count FROM listings WHERE date_created IS NOT NULL
    `);
    console.log(`📊 Записей с date_created: ${checkResult.rows[0].count}`);

    const checkPosted = await client.query(`
      SELECT COUNT(*) as count FROM listings WHERE date_posted IS NOT NULL
    `);
    console.log(`📊 Записей с date_posted: ${checkPosted.rows[0].count}\n`);

    // Начало транзакции
    await client.query('BEGIN');

    // Копируем date_created -> date_posted (только если date_posted пусто)
    const updateResult = await client.query(`
      UPDATE listings
      SET date_posted = date_created
      WHERE date_posted IS NULL AND date_created IS NOT NULL
    `);
    console.log(`✓ Обновлено записей (date_created -> date_posted): ${updateResult.rowCount}`);

    // Коммитим транзакцию
    await client.query('COMMIT');

    console.log('\n✅ Операция завершена!');

    // Проверяем результат
    const finalCheck = await client.query(`
      SELECT COUNT(*) as count FROM listings WHERE date_posted IS NOT NULL
    `);
    console.log(`\n📊 Финальная проверка:`);
    console.log(`   Записей с date_posted: ${finalCheck.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Критическая ошибка:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('🚀 Начинаю исправление дат...\n');
fixDates().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
