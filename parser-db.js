/**
 * Расширение для парсера с поддержкой сохранения в БД
 * Этот файл содержит функции для интеграции парсера с MySQL БД
 * С поддержкой обработки ошибок и fallback хранилища
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Выбираем модуль БД в порядке приоритета:
// 1. PostgreSQL если DATABASE_URL установлен
// 2. SQLite как fallback для локальной разработки
let db;
if (process.env.DATABASE_URL) {
  db = require('./db-pg');
} else if (process.env.DB_TYPE === 'sqlite') {
  db = require('./db-sqlite');
} else {
  db = require('./db');  // MySQL по умолчанию
}

// Параметры retry
const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_DELAY_MS = 1000;

// Путь для сохранения данных при недоступности БД
const OFFLINE_STORAGE_FILE = path.join(__dirname, '.parser_offline_cache.json');

/**
 * Retry функция для операций с БД
 */
async function withRetry(operation, operationName = 'DB operation') {
  let lastError;

  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Попытка ${attempt}/${DB_RETRY_ATTEMPTS} не удалась: ${operationName}`);
      console.warn(`   Причина: ${error.message}`);

      if (attempt < DB_RETRY_ATTEMPTS) {
        const delay = DB_RETRY_DELAY_MS * attempt;
        console.log(`⏳ Ожидание ${delay}ms перед следующей попыткой...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`❌ Не удалось выполнить ${operationName} после ${DB_RETRY_ATTEMPTS} попыток`);
  throw lastError;
}

/**
 * Сохранить данные в локальное хранилище для offline режима
 */
function saveToOfflineStorage(data) {
  try {
    const storageData = {
      timestamp: new Date().toISOString(),
      listings: data
    };
    fs.writeFileSync(OFFLINE_STORAGE_FILE, JSON.stringify(storageData, null, 2));
    console.log(`💾 Данные сохранены в локальное хранилище: ${OFFLINE_STORAGE_FILE}`);
    return true;
  } catch (error) {
    console.error(`❌ Ошибка при сохранении в локальное хранилище: ${error.message}`);
    return false;
  }
}

/**
 * Загрузить данные из локального хранилища
 */
function loadFromOfflineStorage() {
  try {
    if (!fs.existsSync(OFFLINE_STORAGE_FILE)) {
      return null;
    }
    const data = fs.readFileSync(OFFLINE_STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    console.log(`📂 Данные загружены из локального хранилища (${parsed.timestamp})`);
    return parsed.listings;
  } catch (error) {
    console.error(`❌ Ошибка при загрузке из локального хранилища: ${error.message}`);
    return null;
  }
}

class ParserDBAdapter {
  constructor(parser) {
    this.parser = parser;
    this.sessionId = null;
    this.newItemsCount = 0;
    this.updatedItemsCount = 0;
    this.dbAvailable = true; // Флаг доступности БД
    this.savedToOfflineStorage = false; // Флаг сохранения в offline хранилище
  }

  /**
   * Инициализирует сессию парсинга в БД с retry
   */
  async startSession(params = {}) {
    const { v4: uuidv4 } = require('uuid') || { v4: () => `${Date.now()}-${Math.random()}` };
    this.sessionId = params.sessionId || `parse-${Date.now()}`;

    try {
      await withRetry(
        () => db.createParseSession(this.sessionId, {
          minPrice: this.parser.minPrice,
          maxPrice: this.parser.maxPrice,
          maxPages: this.parser.maxPages,
          region: this.parser.region,
          ...params
        }),
        'createParseSession'
      );

      this.dbAvailable = true;
      console.log(`📝 Сессия парсинга создана: ${this.sessionId}`);
    } catch (error) {
      this.dbAvailable = false;
      console.warn(`⚠️ Не удалось создать сессию в БД, работаем в offline режиме`);
      console.log(`📝 Локальная сессия: ${this.sessionId}`);
    }

    return this.sessionId;
  }

  /**
   * Сохраняет объявления в БД с полным перезаписыванием и fallback
   */
  async saveListingsToDB() {
    if (!this.parser.listings || this.parser.listings.length === 0) {
      console.log('⚠️  Нет объявлений для сохранения');
      return { newItems: 0, updatedItems: 0 };
    }

    console.log(`💾 Сохраняю ${this.parser.listings.length} объявлений...`);

    this.newItemsCount = 0;
    this.updatedItemsCount = 0;

    // Если БД недоступна, сохраняем в локальное хранилище
    if (!this.dbAvailable) {
      console.log(`⚠️ БД недоступна, сохраняю в локальное хранилище...`);
      const saved = saveToOfflineStorage(this.parser.listings);
      if (saved) {
        this.savedToOfflineStorage = true;
        return {
          newItems: this.parser.listings.length,
          updatedItems: 0,
          total: this.parser.listings.length,
          savedLocally: true
        };
      }
      return { newItems: 0, updatedItems: 0, error: 'Не удалось сохранить данные' };
    }

    // Сохраняем объявления батчами по 100
    const batchSize = 100;
    let dbErrors = 0;

    for (let i = 0; i < this.parser.listings.length; i += batchSize) {
      const batch = this.parser.listings.slice(i, i + batchSize);

      for (const listing of batch) {
        try {
          const result = await withRetry(
            () => db.insertOrUpdateListing({
              number: listing.number,
              price: listing.price || 0,
              region: listing.region || '',
              status: listing.status || 'active',
              datePosted: listing.datePosted ? this.normalizeDate(listing.datePosted) : null,
              dateUpdated: listing.dateUpdated ? this.normalizeDate(listing.dateUpdated) : null,
              seller: listing.seller || 'unknown',
              url: listing.url || ''
            }),
            `insertOrUpdateListing ${listing.number}`
          );

          if (result && result.success) {
            if (result.action === 'inserted') {
              this.newItemsCount++;
            } else {
              this.updatedItemsCount++;
            }
          }
        } catch (error) {
          dbErrors++;
          console.warn(`⚠️ Ошибка при сохранении ${listing.number}: ${error.message}`);

          // Если слишком много ошибок, переходим в offline режим
          if (dbErrors > 5) {
            console.error(`❌ Слишком много ошибок БД, переходим в offline режим`);
            this.dbAvailable = false;
            saveToOfflineStorage(this.parser.listings);
            this.savedToOfflineStorage = true;
            return {
              newItems: this.newItemsCount,
              updatedItems: this.updatedItemsCount,
              total: this.parser.listings.length,
              savedLocally: true,
              warning: 'Данные сохранены локально из-за ошибок БД'
            };
          }
        }
      }

      // Каждые 500 объявлений выводим прогресс
      if ((i + batchSize) % 500 === 0) {
        console.log(`✓ Обработано ${Math.min(i + batchSize, this.parser.listings.length)} объявлений`);
      }
    }

    console.log(`✅ Сохранено объявлений: ${this.parser.listings.length}`);
    console.log(`   - Новых: ${this.newItemsCount}`);
    console.log(`   - Обновлено: ${this.updatedItemsCount}`);

    return {
      newItems: this.newItemsCount,
      updatedItems: this.updatedItemsCount,
      total: this.parser.listings.length,
      savedLocally: false,
      dbAvailable: this.dbAvailable
    };
  }

  /**
   * Сохраняет объявления в БД с дифференциальным сравнением
   * Возвращает только новые объявления и изменения цен
   */
  async saveDifferentialListingsToDB() {
    if (!this.parser.listings || this.parser.listings.length === 0) {
      console.log('⚠️  Нет объявлений для сохранения');
      return {
        newItems: 0,
        updatedItems: 0,
        unchangedItems: 0,
        newListings: [],
        priceChanges: []
      };
    }

    console.log(`🔄 Выполняю дифференциальное сравнение ${this.parser.listings.length} объявлений...`);

    // Получаем дифференциальные данные
    const diffResult = await db.getDifferentialListings(
      this.parser.listings.map(l => ({
        number: l.number,
        price: l.price || 0,
        region: l.region || '',
        status: l.status || 'active',
        datePosted: l.datePosted ? this.normalizeDate(l.datePosted) : null,
        dateUpdated: l.dateUpdated ? this.normalizeDate(l.dateUpdated) : null,
        seller: l.seller || 'unknown',
        url: l.url || ''
      })),
      this.sessionId
    );

    // Сохраняем новые объявления
    console.log(`💾 Сохраняю ${diffResult.newListings.length} новых объявлений...`);
    for (const listing of diffResult.newListings) {
      await db.insertOrUpdateListing(listing);
      this.newItemsCount++;
    }

    // Обновляем цены для измененных объявлений
    this.updatedItemsCount = diffResult.statistics.updatedCount;

    console.log(`✅ Дифференциальное сравнение завершено:`);
    console.log(`   - Новых объявлений: ${this.newItemsCount}`);
    console.log(`   - Изменены цены: ${this.updatedItemsCount}`);
    console.log(`   - Без изменений: ${diffResult.statistics.unchangedCount}`);

    return {
      newItems: this.newItemsCount,
      updatedItems: this.updatedItemsCount,
      unchangedItems: diffResult.statistics.unchangedCount,
      newListings: diffResult.newListings,
      priceChanges: diffResult.priceChanges,
      statistics: diffResult.statistics
    };
  }

  /**
   * Завершает сессию парсинга
   */
  async completeSession(error = null) {
    if (!this.sessionId) return;

    const data = {
      status: error ? 'failed' : 'completed',
      totalItems: this.parser.listings.length,
      newItems: this.newItemsCount,
      updatedItems: this.updatedItemsCount
    };

    if (error) {
      data.error = error.message || String(error);
    }

    await db.updateParseSession(this.sessionId, data);
    console.log(`📊 Сессия парсинга завершена: ${data.status}`);
  }

  /**
   * Нормализует дату для БД
   */
  normalizeDate(dateStr) {
    if (!dateStr) return null;

    // Если уже в формате YYYY-MM-DD или YYYY-MM-DD HH:MM:SS
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.substring(0, 19); // возвращаем только дату и время
    }

    // Если это ISO строка
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      return this.formatDate(date);
    }

    // Пытаемся распарсить русские даты и другие форматы
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return this.formatDate(date);
      }
    } catch (e) {
      // Ignore
    }

    // Если не удалось распарсить, возвращаем null
    return null;
  }

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

/**
 * Функция для выполнения парсинга с сохранением в БД (полное обновление)
 */
async function runParserWithDB(parserInstance, sessionId = null) {
  const adapter = new ParserDBAdapter(parserInstance);

  try {
    // Инициализируем браузер
    await parserInstance.initBrowser();

    // Создаем сессию
    await adapter.startSession({ sessionId });

    // Запускаем парсинг
    console.log('🚀 Начинаем парсинг...');
    const result = await parserInstance.parse();

    // Сохраняем результаты в БД
    await adapter.saveListingsToDB();

    // Завершаем сессию
    await adapter.completeSession();

    return {
      success: true,
      sessionId: adapter.sessionId,
      items: parserInstance.listings.length,
      ...result
    };
  } catch (error) {
    console.error('❌ Ошибка при парсинге:', error.message);
    await adapter.completeSession(error);

    return {
      success: false,
      sessionId: adapter.sessionId,
      error: error.message
    };
  } finally {
    // Закрываем браузер
    await parserInstance.closeBrowser();
  }
}

/**
 * Функция для выполнения дифференциального парсинга (только новые объявления)
 */
async function runDifferentialParserWithDB(parserInstance, sessionId = null) {
  const adapter = new ParserDBAdapter(parserInstance);

  try {
    // Инициализируем браузер
    await parserInstance.initBrowser();

    // Создаем сессию
    await adapter.startSession({ sessionId });

    // Запускаем парсинг
    console.log('🚀 Начинаем дифференциальный парсинг...');
    const result = await parserInstance.parse();

    // Сохраняем результаты в БД с дифференциальным сравнением
    const diffResult = await adapter.saveDifferentialListingsToDB();

    // Завершаем сессию
    await adapter.completeSession();

    return {
      success: true,
      sessionId: adapter.sessionId,
      totalParsed: parserInstance.listings.length,
      newItems: diffResult.newItems,
      updatedItems: diffResult.updatedItems,
      unchangedItems: diffResult.unchangedItems,
      newListings: diffResult.newListings,
      priceChanges: diffResult.priceChanges,
      ...result
    };
  } catch (error) {
    console.error('❌ Ошибка при дифференциальном парсинге:', error.message);
    await adapter.completeSession(error);

    return {
      success: false,
      sessionId: adapter.sessionId,
      error: error.message
    };
  } finally {
    // Закрываем браузер
    await parserInstance.closeBrowser();
  }
}

/**
 * Функция для регулярного обновления данных
 */
async function scheduledParseTask(parserOptions = {}) {
  const AutonomeraParser = require('./parser');

  console.log('\n' + '='.repeat(60));
  console.log('🕐 АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ДАННЫХ');
  console.log('='.repeat(60));
  console.log(`⏰ ${new Date().toLocaleString('ru-RU')}`);

  try {
    // Создаем экземпляр парсера с параметрами из .env
    const parser = new AutonomeraParser({
      maxPages: parseInt(process.env.MAX_PAGES || '50'),
      minPrice: parseInt(process.env.MIN_PRICE || '0'),
      maxPrice: parseInt(process.env.MAX_PRICE || '999999999'),
      concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS || '500'),
      requestDelayMs: parseInt(process.env.REQUEST_DELAY || '1000'),
      timeout: parseInt(process.env.REQUEST_TIMEOUT || '40000'),
      ...parserOptions
    });

    // Запускаем парсинг с сохранением в БД
    const result = await runParserWithDB(parser);

    console.log('\n📊 Результаты обновления:');
    console.log(`   Всего объявлений: ${result.items}`);
    console.log(`   Успешно: ${result.success ? 'ДА' : 'НЕТ'}`);
    if (result.error) {
      console.log(`   Ошибка: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error('❌ Критическая ошибка при автоматическом обновлении:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  ParserDBAdapter,
  runParserWithDB,
  runDifferentialParserWithDB,
  scheduledParseTask,
  saveToOfflineStorage,
  loadFromOfflineStorage,
  withRetry
};
