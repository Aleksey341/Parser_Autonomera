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

const pool = new Pool(dbConfig);

async function checkTables() {
  const client = await pool.connect();
  try {
    // Check listing_history table structure
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('listing_history', 'price_history')
      ORDER BY table_name, ordinal_position
    `);

    console.log('📋 Структура таблиц:\n');
    let currentTable = '';
    result.rows.forEach(row => {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`\n${currentTable}:`);
      }
      const colName = row.column_name.padEnd(20);
      console.log(`  ${colName} | ${row.data_type}`);
    });

    // Check if history tables exist
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('listing_history', 'price_history')
    `);
    console.log(`\n\nТаблицы истории: ${tableCheck.rows.map(r => r.table_name).join(', ') || 'НЕ НАЙДЕНЫ'}`);

  } finally {
    client.release();
    await pool.end();
  }
}

checkTables();
