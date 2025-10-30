/**
 * Тест API эндпоинтов для загрузки данных из БД
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

console.log('🧪 Тестирование API эндпоинтов...\n');

const pool = new Pool(dbConfig);

async function testAPIs() {
  const client = await pool.connect();

  try {
    // Тест 1: Проверить количество записей в таблице
    console.log('📊 Тест 1: Количество записей в listings');
    const countResult = await client.query('SELECT COUNT(*) as total FROM listings');
    console.log(`   Всего записей: ${countResult.rows[0].total}\n`);

    // Тест 2: Проверить getListingsStats
    console.log('📊 Тест 2: getListingsStats()');
    const statsResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT region) as regions_count,
        ROUND(AVG(price))::bigint as avg_price,
        MIN(price)::bigint as min_price,
        MAX(price)::bigint as max_price,
        DATE(MAX(updated_at)) as last_update
      FROM listings
      WHERE price IS NOT NULL
    `);
    console.log('   Результат stats:');
    console.log('  ', JSON.stringify(statsResult.rows[0], null, 2));

    // Тест 3: Проверить getListingsWithHistory
    console.log('\n📊 Тест 3: getListingsWithHistory (первые 5 записей)');
    const dataResult = await client.query(`
      SELECT
        l.id,
        l.nomer,
        l.price,
        l.region,
        l.status,
        l.date_created,
        l.date_updated,
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
          WHERE lh.nomer = l.nomer
          ORDER BY lh.recorded_at DESC
          LIMIT 1
        ) as last_change
      FROM listings l
      WHERE 1=1
      ORDER BY l.date_updated DESC NULLS LAST
      LIMIT 5
    `);
    console.log(`   Найдено записей: ${dataResult.rows.length}`);
    if (dataResult.rows.length > 0) {
      console.log('   Первая запись:');
      console.log('  ', JSON.stringify(dataResult.rows[0], null, 2));
    }

    // Тест 4: Проверить /api/db/regions запрос
    console.log('\n📊 Тест 4: /api/db/regions');
    const regionsResult = await client.query(`
      SELECT
        COALESCE(region, 0)::text as region,
        COUNT(*) as count,
        ROUND(AVG(price))::bigint as avg_price,
        MIN(price)::bigint as min_price,
        MAX(price)::bigint as max_price
      FROM listings
      WHERE price IS NOT NULL
      GROUP BY region
      HAVING COUNT(*) > 0
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);
    console.log(`   Найдено регионов: ${regionsResult.rows.length}`);
    if (regionsResult.rows.length > 0) {
      console.log('   Первые 3 региона:');
      console.log('  ', JSON.stringify(regionsResult.rows.slice(0, 3), null, 2));
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testAPIs();
