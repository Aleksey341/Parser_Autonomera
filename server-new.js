/**
 * ============================================================================
 * МВП-аналитика: Интерактивный дашборд оценки эффективности глав МО
 * Главный Entry Point приложения
 * ============================================================================
 */

// Загружаем переменные окружения ПЕРЕД всем остальным
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');

// Импортируем маршруты
const mapRoutes = require('./routes/map');
const moCardRoutes = require('./routes/mo-card');
const ratingRoutes = require('./routes/rating');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// НАСТРОЙКА БЕЗОПАСНОСТИ И MIDDLEWARE
// ============================================================================

// Helmet для защиты от типовых уязвимостей
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:"]
    }
  }
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Парсинг JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Trust proxy для работы с обратными прокси (Amvera, Nginx и т.д.)
app.set('trust proxy', 1);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: false
}));

// Rate limiting (1000 запросов за 15 минут)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Слишком много запросов с этого IP, пожалуйста, повторите попытку позже.'
});
app.use(limiter);

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000  // 2 часа
  }
}));

// ============================================================================
// ЛОГИРОВАНИЕ
// ============================================================================

// Логирование всех входящих запросов
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: NODE_ENV,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// API МАРШРУТЫ
// ============================================================================

// Маршруты карты (хлороплета)
app.use('/api/map', mapRoutes);

// Маршруты карточки МО
app.use('/api/mo', moCardRoutes);

// Маршруты таблицы рейтинга
app.use('/api/rating', ratingRoutes);

// Заглушка для справочников (будет реализовано позже)
app.get('/api/methodology/versions', (req, res) => {
  res.json({
    success: true,
    versions: [
      {
        id: 'v1',
        name: 'Методика v1.0',
        valid_from: '2024-01-01',
        valid_to: null,
        is_active: true
      }
    ]
  });
});

// ============================================================================
// ГЛАВНАЯ СТРАНИЦА
// ============================================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// ОБРАБОТКА ОШИБОК
// ============================================================================

// 404
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.path} не найден`);
  res.status(404).json({
    success: false,
    error: 'Endpoint не найден',
    path: req.path,
    method: req.method
  });
});

// Обработчик ошибок (должен быть последним middleware)
app.use((err, req, res, next) => {
  console.error('❌ Ошибка сервера:', err.message);
  console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const errorResponse = {
    success: false,
    error: err.message || 'Внутренняя ошибка сервера'
  };

  if (NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
});

// ============================================================================
// ЗАПУСК СЕРВЕРА
// ============================================================================

async function initializeApp() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 МВП-АНАЛИТИКА: Инициализация приложения');
    console.log('='.repeat(70));

    console.log(`📍 Окружение: ${NODE_ENV}`);
    console.log(`🔒 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);

    // Проверяем переменные окружения
    if (!process.env.DATABASE_URL && NODE_ENV === 'production') {
      throw new Error('❌ Переменная DATABASE_URL не установлена');
    }

    // Запускаем сервер
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ Сервер запущен на http://0.0.0.0:${PORT}`);
      console.log(`📊 API документация:
      - Карта (хлороплета): /api/map?period=202406&version=v1
      - Карточка МО: /api/mo/1?period=202406
      - Таблица рейтинга: /api/rating?period=202406&sort=score_total
      - Сравнение МО: /api/rating/compare?mo_ids=1,2,3
      - Поиск: /api/rating/search?q=липецк`);
      console.log(`\n🏥 Проверка здоровья: /health`);
      console.log(`📁 Статические файлы: /public`);
      console.log('='.repeat(70) + '\n');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Завершение работы сервера...');
      server.close(() => {
        console.log('✓ Сервер закрыт');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n👋 Termination signal получен');
      server.close(() => {
        console.log('✓ Сервер закрыт');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Критическая ошибка при инициализации:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запускаем приложение
initializeApp();

module.exports = app;
