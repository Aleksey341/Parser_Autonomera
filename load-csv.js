/**
 * Скрипт для загрузки CSV файла в PostgreSQL БД
 * Использует папку параметров из .env
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Конфиг БД - явно указываем параметры Amvera
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

// Функция для парсинга CSV
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);

  const headers = lines[0].split(';');
  console.log('📋 Заголовки CSV:', headers);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';');
    const row = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] ? values[index].trim() : null;
    });
    rows.push(row);
  }

  return rows;
}

// Основная функция загрузки
async function loadCSV() {
  const client = await pool.connect();

  try {
    console.log('🔄 Подключено к БД');

    // Читаем CSV
    const csvFile = 'C:\\Users\\cobra\\Desktop\\autonomera777_2025-10-26.csv';
    console.log(`📁 Читаю файл: ${csvFile}`);

    const rows = parseCSV(csvFile);
    console.log(`📊 Загружено ${rows.length} строк из CSV`);

    if (rows.length === 0) {
      console.log('❌ CSV файл пуст!');
      return;
    }

    // Начало транзакции
    await client.query('BEGIN');

    let insertCount = 0;
    let errorCount = 0;

    // Вставляем каждую строку
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        // Преобразуем данные в нужный формат
        const nomer = row['Номер'] || null;
        const price = row['Цена'] ? parseInt(row['Цена']) : null;
        const date_posted = row['Дата размещения'] ? convertDate(row['Дата размещения']) : null;
        const date_updated = row['Дата обновления'] ? convertDate(row['Дата обновления']) : null;
        const status = row['Статус'] || null;
        const region = row['Регион'] ? parseInt(row['Регион']) : null;
        const url = row['URL'] || null;
        const loaded_at = new Date().toISOString();

        const query = `
          INSERT INTO listings (
            nomer, price, date_posted, date_updated, status, region, url, loaded_at, updated_at, parsed_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
          )
        `;

        await client.query(query, [nomer, price, date_posted, date_updated, status, region, url, loaded_at]);
        insertCount++;

        // Показываем прогресс каждые 100 записей
        if ((i + 1) % 100 === 0) {
          console.log(`✓ Обработано ${i + 1}/${rows.length} записей...`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Ошибка в строке ${i + 1}:`, error.message);
      }
    }

    // Коммитим транзакцию
    await client.query('COMMIT');

    console.log(`\n✅ Загрузка завершена!`);
    console.log(`   - Всего строк: ${rows.length}`);
    console.log(`   - Успешно вставлено/обновлено: ${insertCount}`);
    console.log(`   - Ошибок: ${errorCount}`);

    // Проверяем финальное количество записей
    const result = await client.query('SELECT COUNT(*) as total FROM listings');
    console.log(`   - Всего записей в БД: ${result.rows[0].total}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Критическая ошибка:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Функция для преобразования даты из DD.MM.YYYY в YYYY-MM-DD
function convertDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Запуск
console.log('🚀 Начинаю загрузку CSV в PostgreSQL...\n');
loadCSV().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
