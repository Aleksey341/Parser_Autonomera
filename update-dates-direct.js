/**
 * Быстрый скрипт для исправления дат через прямой SQL запрос
 */

const { Pool } = require('pg');
require('dotenv').config();

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://parser_user:Qwerty12345@autonomera-alex1976.db-msk0.amvera.tech:5432/autonomera777',
  ssl: { rejectUnauthorized: false }
};

const pool = new Pool(dbConfig);

async function updateDates() {
  const client = await pool.connect();

  try {
    console.log('🔄 Подключено к БД\n');

    // Проверяем текущее состояние
    const before = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN date_posted IS NOT NULL THEN 1 END) as with_date_posted,
        COUNT(CASE WHEN date_created IS NOT NULL THEN 1 END) as with_date_created
      FROM listings
    `);

    const stats = before.rows[0];
    console.log('📊 Статус ДО изменений:');
    console.log(`   - Всего записей: ${stats.total}`);
    console.log(`   - С date_posted: ${stats.with_date_posted}`);
    console.log(`   - С date_created: ${stats.with_date_created}\n`);

    // Копируем date_created -> date_posted
    const updateResult = await client.query(`
      UPDATE listings
      SET date_posted = date_created
      WHERE date_posted IS NULL AND date_created IS NOT NULL
    `);

    console.log(`✓ Обновлено записей: ${updateResult.rowCount}\n`);

    // Проверяем результат
    const after = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN date_posted IS NOT NULL THEN 1 END) as with_date_posted,
        COUNT(CASE WHEN date_created IS NOT NULL THEN 1 END) as with_date_created
      FROM listings
    `);

    const statsAfter = after.rows[0];
    console.log('📊 Статус ПОСЛЕ изменений:');
    console.log(`   - Всего записей: ${statsAfter.total}`);
    console.log(`   - С date_posted: ${statsAfter.with_date_posted}`);
    console.log(`   - С date_created: ${statsAfter.with_date_created}\n`);

    console.log('✅ Операция завершена!');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('🚀 Начинаю исправление дат...\n');
updateDates().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
