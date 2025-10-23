const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { stringify } = require('csv-stringify/sync');
const AutonomeraParser = require('./parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Хранилище активных сессий парсинга
const sessions = new Map();

/**
 * Генерирует уникальный ID сессии
 */
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * GET /api/health - проверка состояния сервера
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        activeSessions: sessions.size
    });
});

/**
 * POST /api/parse - начало парсинга
 */
app.post('/api/parse', async (req, res) => {
    const {
        minPrice = 0,
        maxPrice = Infinity,
        region = null,
        maxPages = 50,
        delayMs = 1000
    } = req.body;

    const sessionId = generateSessionId();

    console.log(`\n🚀 Новая сессия парсинга: ${sessionId}`);
    console.log(`📊 Параметры: цена ${minPrice}-${maxPrice}, регион: ${region}`);

    const parser = new AutonomeraParser({
        minPrice,
        maxPrice,
        region,
        maxPages,
        delayMs
    });

    // Сохраняем парсер в сессию
    sessions.set(sessionId, {
        parser,
        status: 'running',
        progress: 0,
        startTime: Date.now(),
        error: null
    });

    res.json({
        sessionId,
        status: 'started',
        message: 'Парсинг начался'
    });

    // Запускаем парсинг асинхронно
    parser.parse()
        .then((listings) => {
            const session = sessions.get(sessionId);
            if (session) {
                session.status = 'completed';
                session.listings = listings;
                session.endTime = Date.now();
                session.progress = 100;
            }
            console.log(`✅ Сессия ${sessionId} завершена: ${listings.length} объявлений`);
        })
        .catch((error) => {
            const session = sessions.get(sessionId);
            if (session) {
                session.status = 'error';
                session.error = error.message;
                session.endTime = Date.now();
            }
            console.error(`❌ Ошибка в сессии ${sessionId}:`, error.message);
        });
});

/**
 * GET /api/sessions/:sessionId/status - получение статуса парсинга
 */
app.get('/api/sessions/:sessionId/status', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    const duration = session.endTime
        ? Math.round((session.endTime - session.startTime) / 1000)
        : Math.round((Date.now() - session.startTime) / 1000);

    res.json({
        sessionId,
        status: session.status,
        progress: session.progress,
        listingsCount: session.listings ? session.listings.length : 0,
        startTime: new Date(session.startTime).toISOString(),
        duration: `${duration}s`,
        error: session.error
    });
});

/**
 * GET /api/sessions/:sessionId/data - получение данных парсинга
 */
app.get('/api/sessions/:sessionId/data', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    if (!session.listings) {
        return res.status(400).json({
            error: 'Парсинг еще не завершен'
        });
    }

    res.json({
        sessionId,
        count: session.listings.length,
        listings: session.listings
    });
});

/**
 * GET /api/sessions/:sessionId/export - экспорт данных в CSV
 */
app.get('/api/sessions/:sessionId/export', (req, res) => {
    const { sessionId } = req.params;
    const { format = 'csv' } = req.query;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    if (!session.listings || session.listings.length === 0) {
        return res.status(400).json({
            error: 'Нет данных для экспорта'
        });
    }

    if (format === 'json') {
        const filename = `autonomera777_${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(session.listings, null, 2));
    } else {
        // CSV по умолчанию
        const csvData = stringify(session.listings, {
            header: true,
            columns: [
                { key: 'number', header: 'Номер' },
                { key: 'price', header: 'Цена' },
                { key: 'datePosted', header: 'Дата размещения' },
                { key: 'dateUpdated', header: 'Дата обновления' },
                { key: 'status', header: 'Статус' },
                { key: 'seller', header: 'Продавец' },
                { key: 'region', header: 'Регион' },
                { key: 'url', header: 'URL' }
            ]
        });

        const filename = `autonomera777_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvData);
    }
});

/**
 * DELETE /api/sessions/:sessionId - удаление сессии
 */
app.delete('/api/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const deleted = sessions.delete(sessionId);

    if (!deleted) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    res.json({
        message: 'Сессия удалена'
    });
});

/**
 * GET /api/sessions - список всех сессий
 */
app.get('/api/sessions', (req, res) => {
    const sessionsList = Array.from(sessions.entries()).map(([id, session]) => ({
        sessionId: id,
        status: session.status,
        listingsCount: session.listings ? session.listings.length : 0,
        startTime: new Date(session.startTime).toISOString(),
        error: session.error
    }));

    res.json({
        activeSessions: sessionsList,
        total: sessions.size
    });
});

/**
 * GET /api/stats/:sessionId - статистика по сессии
 */
app.get('/api/stats/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    if (!session.listings || session.listings.length === 0) {
        return res.json({
            count: 0,
            message: 'Парсинг еще не завершен'
        });
    }

    const listings = session.listings;
    const prices = listings.map(l => l.price).filter(p => p > 0);
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b) / prices.length) : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const regions = new Set(listings.map(l => l.region).filter(r => r));
    const sellers = new Set(listings.map(l => l.seller).filter(s => s));

    res.json({
        totalListings: listings.length,
        avgPrice,
        minPrice,
        maxPrice,
        uniqueRegions: regions.size,
        uniqueSellers: sellers.size,
        regions: Array.from(regions),
        stats: {
            priceRange: `₽${minPrice.toLocaleString('ru-RU')} - ₽${maxPrice.toLocaleString('ru-RU')}`,
            avgPriceFormatted: `₽${avgPrice.toLocaleString('ru-RU')}`
        }
    });
});

// Обработчик 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint не найден',
        path: req.path
    });
});

// Обработчик ошибок
app.use((err, req, res, next) => {
    console.error('❌ Ошибка сервера:', err);
    res.status(500).json({
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Запуск сервера
const server = app.listen(PORT, () => {
    console.log(`\n🚀 API сервер запущен на http://localhost:${PORT}`);
    console.log(`📚 API документация доступна на http://localhost:${PORT}/api/health`);
    console.log(`\n📍 Основные endpoints:`);
    console.log(`   POST   /api/parse                      - начать парсинг`);
    console.log(`   GET    /api/sessions                   - список сессий`);
    console.log(`   GET    /api/sessions/:id/status        - статус сессии`);
    console.log(`   GET    /api/sessions/:id/data          - данные парсинга`);
    console.log(`   GET    /api/sessions/:id/stats         - статистика`);
    console.log(`   GET    /api/sessions/:id/export?format=csv|json - экспорт`);
    console.log(`   DELETE /api/sessions/:id               - удалить сессию`);
});

// Обработчик закрытия
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

module.exports = app;
