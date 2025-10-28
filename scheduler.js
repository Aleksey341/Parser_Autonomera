/**
 * Планировщик автоматического парсинга
 * Запускает парсинг по расписанию (по умолчанию ежедневно в 00:00)
 */

const cron = require('node-cron');
const db = require('./db');
const { scheduledParseTask } = require('./parser-db');
require('dotenv').config();

class ParsingScheduler {
  constructor() {
    this.job = null;
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  /**
   * Инициализирует и запускает планировщик
   */
  async initialize() {
    console.log('\n' + '='.repeat(60));
    console.log('📅 ИНИЦИАЛИЗАЦИЯ ПЛАНИРОВЩИКА ПАРСИНГА');
    console.log('='.repeat(60));

    // Получаем параметры из .env
    const parsingTime = process.env.PARSER_TIME || '00:00'; // 00:00 - полночь
    const timezone = process.env.PARSER_TIMEZONE || 'Europe/Moscow';

    console.log(`⏰ Время запуска: ${parsingTime}`);
    console.log(`🌍 Часовой пояс: ${timezone}`);

    // Преобразуем время в формат cron
    // "00:00" -> "0 0 * * *" (ежедневно в полночь)
    const [hours, minutes] = parsingTime.split(':');
    const cronExpression = `${minutes} ${hours} * * *`;

    console.log(`📋 Cron выражение: ${cronExpression}`);

    // Запускаем задачу по расписанию
    this.job = cron.schedule(cronExpression, async () => {
      await this.executeParsingTask();
    }, {
      timezone: timezone,
      name: 'autonomera-parser-cron'
    });

    console.log('✅ Планировщик инициализирован и запущен');
    this.updateNextRun(cronExpression);

    return this;
  }

  /**
   * Выполняет задачу парсинга
   */
  async executeParsingTask() {
    if (this.isRunning) {
      console.log('⚠️  Парсинг уже запущен. Пропускаем эту итерацию.');
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();

    try {
      // Логируем начало
      await this.logCronExecution('started');

      // Запускаем парсинг
      const result = await scheduledParseTask({
        maxPages: parseInt(process.env.MAX_PAGES || '50'),
        minPrice: parseInt(process.env.MIN_PRICE || '0'),
        maxPrice: parseInt(process.env.MAX_PRICE || '999999999'),
        concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS || '500'),
        requestDelayMs: parseInt(process.env.REQUEST_DELAY || '1000')
      });

      // Логируем результат
      await this.logCronExecution('completed', {
        itemsCount: result.items,
        success: result.success
      });

      console.log('✅ Парсинг успешно завершен');

    } catch (error) {
      console.error('❌ Ошибка при выполнении парсинга:', error.message);
      await this.logCronExecution('failed', {
        error: error.message
      });
    } finally {
      this.isRunning = false;
      this.updateNextRun();
    }
  }

  /**
   * Логирует выполнение cron задачи в БД
   */
  async logCronExecution(status, data = {}) {
    try {
      const pool = db.pool();
      const connection = await pool.getConnection();

      if (status === 'started') {
        await connection.execute(`
          INSERT INTO cron_logs (scheduledTime, status)
          VALUES (NOW(), 'running')
        `);
      } else if (status === 'completed') {
        await connection.execute(`
          UPDATE cron_logs
          SET status = 'completed',
              completedAt = NOW(),
              itemsProcessed = ?
          WHERE status = 'running'
          ORDER BY startedAt DESC
          LIMIT 1
        `, [data.itemsCount || 0]);
      } else if (status === 'failed') {
        await connection.execute(`
          UPDATE cron_logs
          SET status = 'failed',
              completedAt = NOW(),
              error = ?
          WHERE status = 'running'
          ORDER BY startedAt DESC
          LIMIT 1
        `, [data.error || 'Unknown error']);
      }

      connection.release();
    } catch (error) {
      console.error('⚠️  Не удалось логировать выполнение cron:', error.message);
    }
  }

  /**
   * Обновляет время следующего запуска
   */
  updateNextRun(cronExpression = null) {
    let hours, minutes;

    if (!cronExpression) {
      const time = process.env.PARSER_TIME || '00:00';
      const [h, m] = time.split(':');
      hours = h;
      minutes = m;
      cronExpression = `${minutes} ${hours} * * *`;
    } else {
      // Парсим cron выражение (format: "MM HH * * *")
      const parts = cronExpression.split(' ');
      minutes = parseInt(parts[0]);
      hours = parseInt(parts[1]);
    }

    const now = new Date();
    let next = new Date(now);
    next.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    this.nextRun = next;
    console.log(`📅 Следующий запуск: ${next.toLocaleString('ru-RU')}`);
  }

  /**
   * Останавливает планировщик
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('⏹️  Планировщик остановлен');
    }
  }

  /**
   * Получает информацию о планировщике
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      isActive: this.job ? !this.job.stopped : false
    };
  }

  /**
   * Принудительно запускает парсинг (не по расписанию)
   */
  async runManually() {
    console.log('\n🚀 ПРИНУДИТЕЛЬНЫЙ ЗАПУСК ПАРСИНГА');
    await this.executeParsingTask();
  }
}

// Экспортируем синглтон
let schedulerInstance = null;

async function getScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new ParsingScheduler();
    await schedulerInstance.initialize();
  }
  return schedulerInstance;
}

module.exports = {
  ParsingScheduler,
  getScheduler
};
