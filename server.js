const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');
const AutonomeraParser = require('./parser');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Увеличиваем размер памяти для Puppeteer
process.setMaxListeners(0);

// Middleware
app.use(cors());
app.use(express.json());

// Trust proxy - для работы с Amvera и другими обратными прокси
app.set('trust proxy', 1);

// Раздача статических файлов (CSS, JS и т.д.)
app.use(express.static(path.join(__dirname, 'public')));

// Логирование всех запросов для отладки
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Не шумим favicon
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

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
        maxPages = 200, // 200 страниц = 10,000 объявлений за батч
        delayMs = 100, // 100ms задержка для максимальной скорости
        concurrentRequests = 500, // 500 параллельных запросов (оптимально для Puppeteer)
        requestDelayMs = 50 // 50ms задержка между параллельными запросами
    } = req.body;

    const sessionId = generateSessionId();

    console.log(`\n🚀 Новая сессия парсинга: ${sessionId}`);
    console.log(`📊 Параметры: цена ${minPrice}-${maxPrice}, регион: ${region}`);
    console.log(`⚡ Параллельные запросы: ${concurrentRequests} одновременно (задержка: ${requestDelayMs}ms)`);

    const parser = new AutonomeraParser({
        minPrice,
        maxPrice,
        region,
        maxPages,
        delayMs,
        concurrentRequests,
        requestDelayMs
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
        .then((result) => {
            const session = sessions.get(sessionId);
            if (session) {
                // Проверяем был ли парсинг приостановлен на батче
                if (result && result.paused) {
                    session.status = 'paused';
                    session.listings = parser.listings;
                    session.batchNumber = result.batchNumber;
                    session.totalSoFar = parser.listings.length;
                    console.log(`⏸️ Сессия ${sessionId} приостановлена на батче ${result.batchNumber}: ${parser.listings.length} объявлений`);
                    console.log(`👉 Для продолжения вызовите: POST /api/sessions/${sessionId}/continue`);
                } else {
                    session.status = 'completed';
                    session.listings = parser.listings || result;
                    session.endTime = Date.now();
                    session.progress = 100;
                    console.log(`✅ Сессия ${sessionId} завершена: ${(parser.listings || result).length} объявлений`);
                }
            }
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

    // Получаем список объявлений из сессии или напрямую из парсера во время работы
    const listings = session.listings || (session.parser && session.parser.listings) || [];
    const listingsCount = listings.length;
    const response = {
        sessionId,
        status: session.status,
        progress: session.progress,
        listingsCount: listingsCount,
        startTime: new Date(session.startTime).toISOString(),
        duration: `${duration}s`,
        error: session.error
    };

    // Добавляем информацию о батчах если парсинг приостановлен
    if (session.status === 'paused') {
        response.batch = {
            number: session.batchNumber || 1,
            itemsPerBatch: 500,
            nextUrl: `/api/sessions/${sessionId}/continue`,
            message: '👉 Используйте POST для продолжения парсинга',
            instruction: `POST http://localhost:3000/api/sessions/${sessionId}/continue`
        };
    }

    res.json(response);
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
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(session.listings, null, 2));
    } else if (format === 'xlsx' || format === 'excel') {
        // Excel XLSX формат с красивым форматированием и добавленным URL
        const headers = ['Номер', 'Цена', 'Дата размещения', 'Дата обновления', 'Статус', 'Регион', 'URL'];
        const rows = session.listings.map(item => [
            item.number || '',
            item.price || '',
            item.datePosted || '',
            item.dateUpdated || '',
            item.status || '',
            item.region || '',
            item.url || ''
        ]);

        // Создаем рабочую книгу с данными
        const ws_data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Объявления');

        // Форматирование шапки (серый фон)
        const headerStyle = {
            fill: { fgColor: { rgb: 'FFD3D3D3' } }, // Серый цвет
            font: { bold: true, color: { rgb: 'FF000000' } }, // Черный текст
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
        };

        // Применяем стили к заголовкам
        for (let i = 0; i < headers.length; i++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
            if (ws[cellRef]) {
                ws[cellRef].s = headerStyle;
            }
        }

        // Автоматически подстраиваем размер колонок
        const colWidths = [];
        for (let i = 0; i < headers.length; i++) {
            let maxWidth = headers[i] ? headers[i].toString().length : 0;
            rows.forEach(row => {
                const cellValue = row[i] ? String(row[i]).length : 0;
                if (cellValue > maxWidth) maxWidth = cellValue;
            });
            colWidths.push({ wch: Math.min(maxWidth + 2, 60) }); // +2 для паддинга, макс 60
        }
        ws['!cols'] = colWidths;

        // Устанавливаем высоту строк
        ws['!rows'] = [{ hpx: 25 }]; // Высота заголовка

        const filename = `autonomera777_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filepath = path.join(process.cwd(), filename);

        // Сохраняем XLSX файл на диск и отправляем
        try {
            // Записываем файл на диск
            XLSX.writeFile(wb, filepath);

            console.log(`📊 XLSX файл создан: ${filepath}`);

            // Отправляем файл с правильными заголовками
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            res.download(filepath, filename, (err) => {
                if (err) {
                    console.error('❌ Ошибка при отправке файла:', err);
                } else {
                    console.log(`✅ Файл отправлен: ${filename}`);
                }

                // Удаляем временный файл после отправки
                setTimeout(() => {
                    fs.unlink(filepath, (unlinkErr) => {
                        if (!unlinkErr) {
                            console.log(`🗑️ Временный файл удален: ${filepath}`);
                        }
                    });
                }, 1000);
            });
        } catch (err) {
            console.error('❌ Ошибка создания XLSX файла:', err);
            res.status(500).json({ error: 'Ошибка при создании Excel файла: ' + err.message });
        }
    } else {
        // CSV по умолчанию - используем csv-stringify для правильного форматирования
        const headers = ['Номер', 'Цена', 'Дата размещения', 'Дата обновления', 'Статус', 'Регион'];
        const rows = session.listings.map(item => [
            item.number || '',
            item.price || '',
            item.datePosted || '',
            item.dateUpdated || '',
            item.status || '',
            item.region || ''
        ]);

        // Добавляем header в начало
        const dataToExport = [headers, ...rows];

        // Используем csv-stringify для правильного экспорта
        const csvContent = stringify(dataToExport, {
            delimiter: ',',
            quoted: true,
            quoted_string: true,
            escape: '"',
            encoding: 'utf8'
        });

        const filename = `autonomera777_${new Date().toISOString().split('T')[0]}.csv`;
        const filepath = path.join(process.cwd(), filename);

        // Добавляем BOM для корректного отображения в Excel
        const bom = Buffer.from('\ufeff', 'utf8');
        const content = Buffer.concat([bom, Buffer.from(csvContent, 'utf8')]);

        // Сохраняем файл
        fs.writeFileSync(filepath, content);

        // Отправляем файл
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.download(filepath, filename, (err) => {
            if (err) {
                console.error('Ошибка при отправке файла:', err);
            }
        });
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

/**
 * POST /api/sessions/:id/continue - продолжить парсинг со следующего батча
 */
app.post('/api/sessions/:id/continue', async (req, res) => {
    const { id } = req.params;
    const session = sessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    if (session.status !== 'paused') {
        return res.status(400).json({
            error: 'Сессия не приостановлена',
            currentStatus: session.status
        });
    }

    const { parser } = session;
    session.status = 'running';
    session.resumeTime = Date.now();

    res.json({
        sessionId: id,
        status: 'resumed',
        message: 'Парсинг продолжается',
        currentCount: parser.listings.length
    });

    // Запускаем продолжение парсинга асинхронно (браузер и страница остаются живыми)
    parser.parse()
        .then((result) => {
            if (result && result.paused) {
                // Парсинг снова приостановлен на следующем батче
                session.status = 'paused';
                session.listings = parser.listings;
                session.batchNumber = result.batchNumber;
                console.log(`⏸️ Сессия ${id} приостановлена на батче ${result.batchNumber}: ${parser.listings.length} объявлений`);
            } else {
                // Парсинг полностью завершен
                session.status = 'completed';
                session.listings = parser.listings || result;
                session.endTime = Date.now();
                session.progress = 100;
                console.log(`✅ Сессия ${id} полностью завершена: ${parser.listings.length} объявлений`);
            }
        })
        .catch((error) => {
            session.status = 'error';
            session.error = error.message;
            session.endTime = Date.now();
            console.error(`❌ Ошибка при продолжении сессии ${id}:`, error.message);
        });
});

/**
 * POST /api/sessions/:sessionId/resume - возобновить парсинг после остановки
 */
app.post('/api/sessions/:sessionId/resume', async (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    if (session.status !== 'stopped') {
        return res.status(400).json({
            error: 'Парсинг не был остановлен',
            currentStatus: session.status
        });
    }

    // Возобновляем парсинг с сохраненного состояния
    const parser = session.pausedParser;
    if (!parser) {
        return res.status(400).json({
            error: 'Парсер не найден в сессии'
        });
    }

    session.status = 'running';
    session.resumeTime = Date.now();

    res.json({
        sessionId,
        status: 'resumed',
        message: 'Парсинг возобновлен',
        currentCount: parser.listings ? parser.listings.length : 0
    });

    // Запускаем продолжение парсинга асинхронно
    parser.parse()
        .then((result) => {
            if (result && result.paused) {
                // Парсинг снова приостановлен на следующем батче
                session.status = 'paused';
                session.listings = parser.listings;
                session.batchNumber = result.batchNumber;
                console.log(`⏸️ Сессия ${sessionId} приостановлена на батче ${result.batchNumber}: ${parser.listings.length} объявлений`);
            } else {
                // Парсинг полностью завершен
                session.status = 'completed';
                session.listings = parser.listings || result;
                session.endTime = Date.now();
                session.progress = 100;
                console.log(`✅ Сессия ${sessionId} полностью завершена: ${parser.listings.length} объявлений`);
            }
        })
        .catch((error) => {
            session.status = 'error';
            session.error = error.message;
            session.endTime = Date.now();
            console.error(`❌ Ошибка при возобновлении сессии ${sessionId}:`, error.message);
        });
});

/**
 * POST /api/sessions/:sessionId/stop - остановить парсинг и получить текущие результаты
 */
app.post('/api/sessions/:sessionId/stop', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({
            error: 'Сессия не найдена'
        });
    }

    if (session.status !== 'running') {
        return res.status(400).json({
            error: 'Парсинг не запущен',
            currentStatus: session.status
        });
    }

    // Останавливаем парсинг (но НЕ закрываем браузер для возможности возобновления)
    const parser = session.parser;

    // Сохраняем текущее состояние парсера для возможности возобновления
    session.status = 'stopped';
    session.listings = parser ? parser.listings : [];
    session.endTime = Date.now();
    session.stoppedAt = session.listings ? session.listings.length : 0;

    // Сохраняем парсер в сессию для возможности возобновления (не закрываем браузер!)
    session.pausedParser = parser;

    console.log(`🛑 Сессия ${sessionId} остановлена: ${session.stoppedAt} объявлений собрано`);

    res.json({
        sessionId,
        status: 'stopped',
        message: 'Парсинг остановлен',
        listingsCount: session.stoppedAt,
        listings: session.listings
    });
});

// === WEB-ИНТЕРФЕЙС ДЛЯ ЗАПУСКА ПАРСЕРА ===
// ВАЖНО: эти маршруты ДОЛЖНЫ быть перед app.use() обработчиками!

// GET / — главная страница с простой инструкцией
// GET / — главная страница
app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="utf-8">
      <title>Autonomera777 Parser</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        p { color: #666; line-height: 1.6; }
        a { color: #0066cc; text-decoration: none; margin-right: 15px; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>🚀 Autonomera777 Parser</h1>
      <p>Сервер работает корректно!</p>

      <h2>Доступные операции:</h2>
      <ul>
        <li><a href="/run">▶️ Запустить парсинг</a> — начать сбор данных</li>
        <li><a href="/api/health">🏥 /api/health</a> — проверка статуса</li>
        <li><a href="/api/sessions">📊 /api/sessions</a> — список активных сессий</li>
      </ul>

      <h2>API Endpoints:</h2>
      <pre>
GET    /                               - эта страница
GET    /run                            - запуск парсера
GET    /session/:id                    - статус сессии
POST   /api/parse                      - начать парсинг
GET    /api/health                     - проверка здоровья
GET    /api/sessions                   - список сессий
GET    /api/sessions/:id/status        - статус конкретной сессии
GET    /api/sessions/:id/data          - данные парсинга
GET    /api/sessions/:id/export        - экспорт (csv/json)
POST   /api/sessions/:id/continue      - продолжить парсинг
DELETE /api/sessions/:id               - удалить сессию
      </pre>
    </body>
    </html>
  `);
});

// GET /run — запускает парсер и редиректит на статус
app.get('/run', async (req, res) => {
  const priceMin = Number(req.query.priceMin ?? 0);
  const priceMax = Number(req.query.priceMax ?? 10000000);
  const region   = (req.query.region || '').toString().trim() || null;

  try {
    const r = await fetch('http://localhost:3000/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceMin, priceMax, region })
    });
    if (!r.ok) return res.status(500).send(await r.text());

    const data = await r.json();
    const id = data.sessionId || data.id;
    // Используем относительный редирект - Express с trust proxy сам всё правильно сформирует
    return res.redirect(303, `/session/${id}`);
  } catch (e) {
    return res.status(500).send(String(e));
  }
});

// GET /session/:id — простейшая страница статуса
app.get('/session/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r = await fetch(`http://localhost:3000/api/sessions/${id}/status`);
    const s = await r.json();
    res.type('html').send(`
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Статус парсинга</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1 { color: #333; }
        .status { padding: 10px; border-radius: 4px; margin: 10px 0; }
        .status.running { background: #e3f2fd; color: #1976d2; }
        .status.paused { background: #fff3e0; color: #f57c00; }
        .status.completed { background: #e8f5e9; color: #388e3c; }
        .status.error { background: #ffebee; color: #d32f2f; }
        a, button { padding: 8px 12px; margin: 5px; border-radius: 4px; text-decoration: none; display: inline-block; }
        a { background: #0066cc; color: white; }
        button { background: #0066cc; color: white; border: none; cursor: pointer; font-size: 14px; }
        a:hover, button:hover { background: #0052a3; }
        .links { margin: 20px 0; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
      </style>
      <h1>🔄 Статус парсинга</h1>
      <div class="status ${s.status}">
        <strong>Статус:</strong> ${s.status}
        ${s.processed ? ` | <strong>Обработано:</strong> ${s.processed}` : ''}
      </div>
      <div class="links">
        <a href="/api/sessions/${id}/data" target="_blank">📊 Данные</a>
        <a href="/api/sessions/${id}/export?format=json" target="_blank">📄 JSON</a>
        <a href="/api/sessions/${id}/export?format=csv" target="_blank">📋 CSV</a>
        ${s.status === 'paused' ? `<form method="POST" action="/api/sessions/${id}/continue" style="display:inline;"><button>▶️ Продолжить (ещё 500)</button></form>` : ''}
        <a href="/">🏠 На главную</a>
      </div>
      <pre>${JSON.stringify(s, null, 2)}</pre>
      <script>
        if ('${s.status}' !== 'completed' && '${s.status}' !== 'error') {
          setTimeout(() => location.reload(), 3000);
        }
      </script>
    `);
  } catch (e) {
    res.status(500).type('html').send(`
      <meta charset="utf-8">
      <h1>❌ Ошибка</h1>
      <p>${String(e)}</p>
      <a href="/">На главную</a>
    `);
  }
});

// Обработчик 404
app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.path} не найден`);
    res.status(404).json({
        error: 'Endpoint не найден',
        path: req.path,
        method: req.method
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

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 API сервер запущен на http://0.0.0.0:${PORT}`);
    console.log(`📚 API документация доступна на http://0.0.0.0:${PORT}/api/health`);
    console.log(`\n📍 Основные endpoints:`);
    console.log(`   GET    /                               - главная страница`);
    console.log(`   GET    /run                            - запуск парсера с редиректом на статус`);
    console.log(`   GET    /session/:id                    - страница статуса сессии`);
    console.log(`   POST   /api/parse                      - начать парсинг`);
    console.log(`   GET    /api/sessions                   - список сессий`);
    console.log(`   GET    /api/sessions/:id/status        - статус сессии (с инфо о батчах)`);
    console.log(`   GET    /api/sessions/:id/data          - данные парсинга`);
    console.log(`   GET    /api/sessions/:id/stats         - статистика`);
    console.log(`   GET    /api/sessions/:id/export?format=csv|json - экспорт`);
    console.log(`   POST   /api/sessions/:id/continue      - продолжить парсинг (батч по 500)`);
    console.log(`   DELETE /api/sessions/:id               - удалить сессию`);
    console.log(`\n⚡ НОВОЕ: Парсер загружает по 500 объявлений, затем паузирует!`);
    console.log(`   1. Начните парсинг: GET /run?priceMin=0&priceMax=10000000&region=`);
    console.log(`   2. Автоматический редирект на /session/:id`);
    console.log(`   3. При статусе "paused" нажмите "Продолжить"`);
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
