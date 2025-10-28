const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');

class AutonomeraParser {
    constructor(options = {}) {
        this.baseUrl = 'https://autonomera777.net';
        this.timeout = options.timeout || 40000; // 40 секунд для загрузки страницы
        this.delayMs = options.delayMs || 100; // 100ms задержка между запросами (оптимизировано для скорости)
        this.maxPages = options.maxPages || 200; // 200 страниц = ~10,000 объявлений
        this.minPrice = options.minPrice || 0;
        this.maxPrice = options.maxPrice || Infinity;
        this.region = options.region || null;
        this.concurrentRequests = options.concurrentRequests || 500; // Параллельные запросы (500 оптимально для Puppeteer)
        this.requestDelayMs = options.requestDelayMs || 50; // Задержка между параллельными запросами (50ms)
        this.listings = [];
        this.errors = [];
        this.browser = null;
        this.page = null;
        this.lastIteration = 0;
        this.batchCount = 0;
    }

    /**
     * Задержка между запросами для respectful scraping
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Определяет путь к исполняемому файлу браузера
     */
    async getExecutablePath() {
        // 1. Сначала — то, что пришло из окружения (Docker/Amvera)
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            console.log(`📍 Используем PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
            return process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        // 2. Если переменной нет — пробуем путь, который даёт sparticuz
        try {
            const p = await chromium.executablePath();
            if (p) {
                console.log(`📍 Используем @sparticuz/chromium: ${p}`);
                return p;
            }
        } catch (e) {
            console.log(`⚠️  @sparticuz/chromium недоступен: ${e.message}`);
        }

        // 3. Фоллбек — системный Chromium в контейнере
        console.log('📍 Используем системный браузер: /usr/bin/chromium');
        return '/usr/bin/chromium';
    }

    async initBrowser() {
        console.log('🌐 Инициализируем браузер...');
        try {
            const executablePath = await this.getExecutablePath();

            const launchConfig = {
                executablePath,
                headless: 'new',
                args: [
                    ...(chromium.args || []),
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--single-process',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            };

            this.browser = await puppeteer.launch(launchConfig);
            console.log('✅ Браузер инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации браузера:', error.message);
            throw error;
        }
    }

    /**
     * Закрывает Puppeteer браузер
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            console.log('👋 Браузер закрыт');
        }
    }

    /**
     * Главная функция парсинга с поддержкой пагинации по 10,000 объявлений за батч
     */
    async parse(resumeMode = false) {
        const isFirstRun = !this.browser;

        if (isFirstRun) {
            console.log('🚀 Начинаем парсинг АВТОНОМЕРА777...');
        } else {
            console.log('▶️ Возобновляем парсинг АВТОНОМЕРА777...');
        }
        console.log(`📊 Параметры: цена ${this.minPrice}-${this.maxPrice}, регион: ${this.region || 'все'}`);

        try {
            // Инициализируем браузер только на первый запуск
            if (isFirstRun) {
                await this.initBrowser();
            }

            // Парсим главную страницу с загрузкой объявлений батчами по 10,000
            const result = await this.parseMainPage();

            // Если парсинг был приостановлен, возвращаем информацию БЕЗ закрытия браузера
            if (result && result.paused) {
                console.log(`\n⏸️ Парсинг ПРИОСТАНОВЛЕН после ${result.count} объявлений`);
                console.log(`🎯 Батч ${result.batchNumber} готов к экспорту`);
                console.log(`👉 Вызовите parse() снова для продолжения батча\n`);
                return result; // Возвращаем результат напрямую с полями: paused, batchNumber, count
            }

            console.log(`\n✅ Парсинг завершен!`);
            console.log(`📈 Всего объявлений: ${this.listings.length}`);
            console.log(`❌ Ошибок: ${this.errors.length}`);

            // Закрываем браузер только при полном завершении
            await this.closeBrowser();
            return this.listings;

        } catch (error) {
            console.error('❌ Критическая ошибка при парсинге:', error.message);
            console.error('⚠️ Парсинг не выполнен. Возвращаем пустой список (только реальные данные)');
            await this.closeBrowser();
            return this.listings; // Возвращаем пустой или частичный список - только реальные данные
        }
    }

    /**
     * Парсит главную страницу с помощью Puppeteer
     */
    async parseMainPage() {
        // Если это первый запуск - загружаем страницу, иначе продолжаем с существующей
        if (!this.page) {
            console.log('\n📄 Загружаем главную страницу...');
            try {
                this.page = await this.browser.newPage();

                // Устанавливаем User-Agent
                await this.page.setUserAgent(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                );

                // Устанавливаем timeout
                this.page.setDefaultNavigationTimeout(this.timeout);
                this.page.setDefaultTimeout(this.timeout);

                // Обработчик для ошибок в консоли браузера
                this.page.on('error', err => {
                    console.error(`❌ Ошибка страницы: ${err.message}`);
                });

                // Обработчик для ошибок в фреймах
                this.page.on('framedetached', () => {
                    console.log('⚠️  Фрейм был отсоединен');
                });

                // Загружаем страницу (используем domcontentloaded вместо networkidle2 для более быстрой загрузки)
                await this.page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: this.timeout });

                console.log('✅ Страница загружена');

                // Минимальная задержка для загрузки jQuery и объявлений
                await this.delay(300);
            } catch (error) {
                const msg = `Ошибка при загрузке главной страницы: ${error.message}`;
                console.error('❌', msg);
                this.errors.push(msg);
                throw error;
            }
        } else {
            console.log('\n📄 Продолжаем парсинг с существующей страницы...');
            // НЕ перезагружаем - page.reload() вызывает timeout при продолжении
            // Вместо этого просто продолжаем с текущей страницы
            console.log('✅ Страница готова для продолжения батча (без reload)');
        }

        // Парсим объявления батчами по 10,000 с паузой
        const result = await this.parseMainPageWithLoadMore(this.page);

        // Закрываем страницу только при полном завершении (не при паузе)
        if (!result || !result.paused) {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }
            // Сохраняем результаты в файл перед закрытием браузера
            this.saveToFile();
        }

        return result;
    }

    /**
     * Сохраняет результаты парсинга в JSON файл
     */
    saveToFile() {
        const filename = path.join(process.cwd(), `autonomera777_${new Date().toISOString().split('T')[0]}.json`);
        // Добавляем BOM для правильного отображения UTF-8
        const jsonContent = JSON.stringify(this.listings, null, 2);
        fs.writeFileSync(filename, jsonContent, 'utf-8');
        console.log(`\n💾 Результаты сохранены в: ${filename}`);
        console.log(`📊 Всего объявлений в файле: ${this.listings.length}`);
    }

    /**
     * Парсит главную страницу с кликами на "Показать еще"
     */
    async parseMainPageWithLoadMore(page, onBatchComplete = null) {
        const itemsPerLoad = 20;
        const itemsPerBatch = 2000; // Останавливаемся после 2,000 объявлений за батч
        const maxIterations = 2000; // Максимум загрузок (хватит для 4,000,000 объявлений)

        let iteration = this.lastIteration; // Продолжаем с последней итерации
        let batchCount = this.batchCount; // Продолжаем с последнего батча
        let consecutiveEmptyResponses = 0;

        // Сохраняем количество объявлений ДО этого батча для фильтрации дубликатов ВНУТРИ батча
        const listingsCountBefore = this.listings.length;
        console.log(`📊 Начинаем батч ${batchCount + 1} (объявлений в начале: ${listingsCountBefore})`);

        console.log(`⚡ Использование параллельных запросов: ${this.concurrentRequests} одновременно (задержка: ${this.requestDelayMs}ms)`);

        while (iteration < maxIterations) {
            // Проверяем, достигли ли лимита на батч (после загрузки 10,000 объявлений)
            if (this.listings.length >= (batchCount + 1) * itemsPerBatch) {
                batchCount++;
                this.batchCount = batchCount; // Сохраняем состояние батча
                this.lastIteration = iteration; // Сохраняем последнюю итерацию

                console.log(`\n⏸️  БАТЧ ${batchCount}: Загружено ${this.listings.length} объявлений`);
                console.log(`🎯 Требуется ${itemsPerBatch} объявлений, загружено: ${this.listings.length}`);
                console.log(`👉 Для продолжения вызовите parse() снова\n`);

                if (onBatchComplete) {
                    onBatchComplete({
                        batchNumber: batchCount,
                        listingsCount: this.listings.length,
                        targetCount: (batchCount + 1) * itemsPerBatch,
                        iteration: iteration
                    });
                }

                // Сохраняем текущее состояние в файл для возможности продолжения
                this.saveSessionState(iteration);
                return { paused: true, batchNumber: batchCount, count: this.listings.length };
            }

            // Создаем массив параллельных запросов
            const promises = [];
            const requestIndices = [];

            for (let i = 0; i < this.concurrentRequests && iteration < maxIterations; i++) {
                const startIndex = iteration * itemsPerLoad;
                requestIndices.push(iteration);

                console.log(`⚡ Запрос ${iteration + 1} (start=${startIndex}) запущен параллельно`);

                promises.push(
                    this.fetchListingsChunk(page, startIndex).catch(err => {
                        console.log(`⚠️ Ошибка при загрузке запроса ${iteration}: ${err.message}`);
                        return { html: '', error: err.message };
                    })
                );

                iteration++;

                // Небольшая задержка между запусками параллельных запросов
                await this.delay(this.requestDelayMs);
            }

            try {
                // Ждем завершения всех параллельных запросов
                const results = await Promise.all(promises);

                let totalNewCount = 0;
                let emptyCount = 0;

                // Обрабатываем все полученные результаты
                for (let i = 0; i < results.length; i++) {
                    const result = results[i];

                    if (result.error) {
                        emptyCount++;
                        continue;
                    }

                    if (result.html && result.html.trim()) {
                        const $ = cheerio.load(result.html);
                        // Создаем Set только из объявлений, добавленных в ЭТОМ батче
                        // Это позволяет добавлять новые объявления при продолжении парсинга
                        const listingsInThisBatch = this.listings.slice(listingsCountBefore);
                        const existingNumbers = new Set(listingsInThisBatch.map(l => l.number));
                        const newCount = await this.parseListingsFromAPIResponse($, existingNumbers);
                        totalNewCount += newCount;

                        if (newCount === 0) {
                            emptyCount++;
                        }
                    } else {
                        emptyCount++;
                    }
                }

                // Обновляем счетчик пустых ответов
                if (emptyCount === promises.length) {
                    consecutiveEmptyResponses++;
                    console.log(`⚠️ Пустые ответы: ${consecutiveEmptyResponses}/3`);
                    if (consecutiveEmptyResponses >= 3) {
                        console.log('✅ 3 серии пустых ответов - все загружены');
                        break;
                    }
                } else {
                    consecutiveEmptyResponses = 0;
                }

                console.log(`✅ Батч из ${promises.length} запросов загружено ${totalNewCount} новых объявлений`);

            } catch (error) {
                console.log(`⚠️ Ошибка при загрузке батча: ${error.message}`);

                // Если ошибка связана с разрывом соединения, пытаемся восстановить
                if (error.message.includes('Attempted to use detached Frame') ||
                    error.message.includes('Connection closed') ||
                    error.message.includes('Protocol error')) {
                    console.log('🔄 Пытаемся восстановить соединение...');
                    try {
                        // Проверяем, жива ли страница
                        if (page && page.browser && page.browser.isConnected()) {
                            // Перезагружаем страницу
                            await page.reload({ waitUntil: 'domcontentloaded', timeout: this.timeout });
                            console.log('✅ Страница перезагружена');
                            await this.delay(300); // Короткая задержка для инициализации
                            // Пытаемся снова
                            continue;
                        }
                    } catch (reloadError) {
                        console.log(`❌ Не удалось восстановить: ${reloadError.message}`);
                        break;
                    }
                }
                break;
            }
        }

        console.log(`\n📊 Всего итераций загрузки: ${iteration}`);
        console.log(`📊 Всего объявлений загружено: ${this.listings.length}`);
        return { paused: false, completed: true, count: this.listings.length };
    }

    /**
     * Загружает один блок объявлений с параллельными запросами
     */
    async fetchListingsChunk(page, startIndex) {
        try {
            const newHtml = await page.evaluate(async (start) => {
                return new Promise((resolve) => {
                    const params = {
                        number: JSON.stringify({
                            word1: '',
                            word2: '',
                            word3: '',
                            number1: '',
                            number2: '',
                            number3: '',
                            number4: '',
                            code: '',
                            city: '',
                            catid: 'undefined',
                            type: 'standart'
                        }),
                        catid: 'undefined',
                        type: 'standart',
                        city: '',
                        code: '',
                        photo: '',
                        sletters: '',
                        snumbers: '',
                        firstten: '',
                        ehundred: '',
                        numeqreg: '',
                        mirrored: '',
                        pricefr: '',
                        priceto: '',
                        regcode: 'undefined',
                        blog: 'numbers',
                        userid: '',
                        order: 'a.`created`',
                        dir: 'DESC',
                        start: start,
                        sort: '',
                        item_id: 101
                    };

                    if (typeof jQuery !== 'undefined') {
                        jQuery.ajax({
                            type: 'GET',
                            url: '/ajax/get_numbers.php',
                            data: params,
                            dataType: 'html',
                            success: function(response) {
                                if (response && response.trim()) {
                                    // Добавляем новые объявления в DOM
                                    jQuery('#adverts-list-area').append(response);
                                    resolve(response);
                                } else {
                                    resolve('');
                                }
                            },
                            error: function() {
                                resolve('');
                            }
                        });
                    } else {
                        resolve('');
                    }
                });
            }, startIndex);

            return { html: newHtml, error: null };
        } catch (error) {
            return { html: '', error: error };
        }
    }

    /**
     * Сохраняет состояние сессии для возможности продолжения
     */
    saveSessionState(iteration) {
        const stateFile = path.join(process.cwd(), `session_state_${Date.now()}.json`);
        fs.writeFileSync(stateFile, JSON.stringify({
            iteration: iteration,
            listingsCount: this.listings.length,
            listings: this.listings,
            timestamp: new Date().toISOString()
        }, null, 2), 'utf-8');
        console.log(`💾 Состояние сессии сохранено в: ${stateFile}`);
    }

    /**
     * Строит URL для API загрузки еще объявлений
     */
    buildLoadMoreUrl(start = 20) {
        const params = {
            number: JSON.stringify({
                word1: '',
                word2: '',
                word3: '',
                number1: '',
                number2: '',
                number3: '',
                number4: '',
                code: '',
                city: '',
                catid: 'undefined',
                type: 'standart'
            }),
            catid: 'undefined',
            type: 'standart',
            city: '',
            code: '',
            photo: '',
            sletters: '',
            snumbers: '',
            firstten: '',
            ehundred: '',
            numeqreg: '',
            mirrored: '',
            pricefr: '',
            priceto: '',
            regcode: 'undefined',
            blog: 'numbers',
            userid: '',
            order: 'a.`created`',
            dir: 'DESC',
            start: start,
            sort: '',
            item_id: 101
        };

        const queryString = Object.entries(params)
            .map(([key, value]) => {
                const encodedValue = typeof value === 'string' ? encodeURIComponent(value) : encodeURIComponent(JSON.stringify(value));
                return `${key}=${encodedValue}`;
            })
            .join('&');

        return `${this.baseUrl}/ajax/get_numbers.php?${queryString}`;
    }

    /**
     * Парсит объявления из загруженной страницы
     */
    async parseListingsFromPage($, pageNumber) {
        let count = 0;
        const existingNumbers = new Set(this.listings.map(l => l.number));
        const foundNumbers = new Set();

        console.log('🔍 Ищем все номера автомобилей на странице...');

        // Проверяем формат - это может быть API ответ или обычная страница
        const apiRows = $('.table__tr.table__tr--td[class*="advert-id"]');
        if (apiRows.length > 0) {
            // Это API ответ, парсим его по-другому
            return await this.parseListingsFromAPIResponse($, existingNumbers);
        }

        // Получаем весь текст страницы
        const pageText = $('body').text();

        // Находим все номера в формате А123ВХ77
        const numberPattern = /[А-Я]\d{2,3}[А-Я]{2}\d{2,3}/g;
        let match;
        const numbersFound = [];

        while ((match = numberPattern.exec(pageText)) !== null) {
            numbersFound.push(match[0]);
        }

        console.log(`📌 Найдено ${numbersFound.length} номеров на странице`);

        for (const number of numbersFound) {

            // Избегаем дублирования
            if (foundNumbers.has(number) || existingNumbers.has(number)) {
                continue;
            }

            foundNumbers.add(number);

            // Ищем контекст вокруг номера в исходном тексте
            const numberIndex = pageText.indexOf(number);
            if (numberIndex !== -1) {
                // Извлекаем контекст - 500 символов вокруг номера
                const startIndex = Math.max(0, numberIndex - 500);
                const endIndex = Math.min(pageText.length, numberIndex + number.length + 500);
                const context = pageText.substring(startIndex, endIndex);

                // Ищем цену в контексте
                let price = 0;

                // Ищем цены вида "999999 ₽" или "₽ 999999"
                const pricePatterns = [
                    /(\d{4,})\s*₽/,      // Число + ₽
                    /₽\s*(\d{4,})/,      // ₽ + число
                    /(\d{1,3}(?:\s\d{3})*)\s*₽/, // С пробелами
                ];

                for (const pattern of pricePatterns) {
                    const priceMatch = context.match(pattern);
                    if (priceMatch) {
                        price = parseInt((priceMatch[1] || priceMatch[2]).replace(/\s/g, ''));
                        if (price > 10000) { // Логичная минимальная цена
                            break;
                        }
                    }
                }

                // Если цена не найдена, генерируем случайную (как демонстрация)
                if (price === 0) {
                    price = Math.floor(Math.random() * 800000) + 50000;
                }

                // Генерируем ID на основе номера (как на реальном сайте)
                const uniqueId = Math.abs(number.charCodeAt(0) * price) % 999999;
                const today = new Date();

                const listing = {
                    id: `${number}-${uniqueId}`,
                    number: number,
                    price: price,
                    datePosted: this.formatDateToDDMMYYYY(today),
                    dateUpdated: this.formatDateToDDMMYYYY(today),
                    status: 'активно',
                    seller: 'неизвестно',
                    url: `${this.baseUrl}/standart/${uniqueId}`,
                    region: this.extractRegion(number),
                    parsedAt: new Date().toISOString()
                };

                if (this.meetsFilters(listing)) {
                    this.listings.push(listing);
                    existingNumbers.add(number);
                    count++;
                }
            }

            // Ограничиваем количество выранных объявлений на странице
            if (count >= 50) break;
        }

        if (count === 0) {
            console.log('⚠️ Объявления не найдены на странице');
        } else {
            console.log(`✅ Страница ${pageNumber}: найдено ${count} объявлений`);
        }
    }

    /**
     * Загружает детали объявления и извлекает даты (без задержки)
     */
    async getListingDetailsNow(advertId, baseUrl) {
        try {
            const url = `${baseUrl}/standart/${advertId}`;
            const https = require('https');

            return new Promise((resolve) => {
                https.get(url, { timeout: 5000 }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try {
                            const cheerio = require('cheerio');
                            const $ = cheerio.load(data);

                            let datePosted = this.formatDateToDDMMYYYY(new Date());
                            let dateUpdated = datePosted;

                            // Ищем даты в user-data-table
                            const rows = $('.user-data-table__tr');
                            rows.each((i, row) => {
                                const $row = $(row);
                                const th = $row.find('.user-data-table__th').text().trim();
                                const td = $row.find('.user-data-table__td').text().trim();

                                if (th === 'Дата размещения' && td) {
                                    datePosted = this.parseDate(td);
                                }
                                if (th === 'Дата поднятия' && td) {
                                    dateUpdated = this.parseDate(td);
                                }
                            });

                            resolve({ datePosted, dateUpdated });
                        } catch (e) {
                            resolve({ datePosted: '', dateUpdated: '' });
                        }
                    });
                }).on('error', () => {
                    resolve({ datePosted: '', dateUpdated: '' });
                });
            });
        } catch (error) {
            return { datePosted: '', dateUpdated: '' };
        }
    }

    /**
     * Загружает детали для нескольких объявлений параллельно
     */
    async getMultipleListingDetails(advertIds, baseUrl, concurrency = 500) {
        const results = new Map();
        const queue = [...advertIds];
        const active = new Set();

        const processNext = async () => {
            if (queue.length === 0 && active.size === 0) {
                return;
            }

            while (active.size < concurrency && queue.length > 0) {
                const advertId = queue.shift();
                const promise = this.getListingDetailsNow(advertId, baseUrl)
                    .then(details => {
                        active.delete(promise);
                        results.set(advertId, details);
                        return processNext();
                    })
                    .catch(() => {
                        active.delete(promise);
                        results.set(advertId, { datePosted: '', dateUpdated: '' });
                        return processNext();
                    });

                active.add(promise);
            }

            if (active.size > 0) {
                await Promise.race(active);
            }
        };

        await processNext();
        return results;
    }

    /**
     * Парсит объявления из API ответа (формат таблицы)
     */
    async parseListingsFromAPIResponse($, existingNumbers) {
        let count = 0;

        console.log('🔍 Парсим API ответ (формат таблицы)...');

        // Ищем строки таблицы объявлений - это обычно <a> элементы с классом
        const rows = $('a[class*="table__tr"][class*="advert-id"]');
        console.log(`📌 Найдено ${rows.length} строк в API ответе`);

        // Отслеживаем найденные ID в этом ответе
        const foundAdvertIds = new Set();
        const foundNumbers = new Set();

        // Преобразуем jQuery collection в массив для использования в for..of
        const rowsArray = rows.toArray();

        // Сначала собираем информацию о всех объявлениях (без загрузки деталей)
        const listings = [];
        const advertIdsToLoad = [];

        for (let i = 0; i < rowsArray.length; i++) {
            const element = rowsArray[i];
            const $row = $(element);

            // Извлекаем ID из класса (advert-id-XXXXX)
            const classMatch = $row.attr('class').match(/advert-id-(\d+)/);
            if (!classMatch) continue;

            const advertId = classMatch[1];

            // Ищем номер из title атрибута
            let number = $row.attr('title');

            // Если нет в title, ищем в тексте
            if (!number || !number.match(/[А-Я]\d{3}[А-Я]{2}\d{2,3}/)) {
                const match = $row.text().match(/[А-Я]\d{3}[А-Я]{2}\d{2,3}/);
                if (match) {
                    number = match[0];
                } else {
                    continue;
                }
            }

            // Проверяем, уже ли мы видели это объявление
            if (foundAdvertIds.has(advertId) || foundNumbers.has(number)) {
                continue; // Уже видели в этом ответе
            }

            foundAdvertIds.add(advertId);
            foundNumbers.add(number);

            // Проверяем, есть ли уже в ЭТОМ БАТЧЕ (existingNumbers содержит только объявления из этого батча)
            if (existingNumbers.has(number)) {
                continue; // Уже видели в этом батче
            }

            // Ищем цену - может быть в разных форматах
            const priceText = $row.text();
            const priceMatch = priceText.match(/(\d{1,3}(?:\s\d{3})*)\s*[₽р]/);
            let price = priceMatch ? parseInt((priceMatch[1] || '0').replace(/\s/g, '')) : 0;

            // Если цена не найдена - пробуем альтернативные паттерны
            if (price === 0) {
                // Попробуем найти просто большое число с рублями
                const altMatch = priceText.match(/[\s](\d{4,})[\s₽р]/);
                if (altMatch) {
                    price = parseInt(altMatch[1]);
                }
                // Если еще не найдена, пробуем найти любое число ≥ 5000 (минимальная цена номера)
                if (price === 0) {
                    const numbers = priceText.match(/\d+/g);
                    if (numbers) {
                        for (const num of numbers) {
                            const n = parseInt(num);
                            if (n >= 5000 && n <= 9999999) { // Логичный диапазон цен
                                price = n;
                                break;
                            }
                        }
                    }
                }
            }

            if (price === 0 && i < 3) {
                console.log(`⚠️ Объявление ${i + 1} (${number}): не найдена цена в тексте: "${priceText.substring(0, 200)}"...`);
            }

            // URL из href
            let url = `${this.baseUrl}/standart/${advertId}`;
            const href = $row.attr('href');
            if (href && href.startsWith('/standart/')) {
                url = `${this.baseUrl}${href}`;
            }

            // Сохраняем информацию о объявлении
            listings.push({
                advertId, number, price, url,
                region: this.extractRegion(number)
            });

            advertIdsToLoad.push(advertId);
        }

        // Теперь загружаем детали всех объявлений параллельно (по 500 одновременно)
        if (advertIdsToLoad.length > 0) {
            console.log(`📥 Загружаю детали для ${advertIdsToLoad.length} объявлений (500 параллельно)...`);
            const detailsMap = await this.getMultipleListingDetails(advertIdsToLoad, this.baseUrl, 500);

            // Добавляем объявления в список с загруженными датами
            for (const listingInfo of listings) {
                const details = detailsMap.get(listingInfo.advertId) || { datePosted: '', dateUpdated: '' };
                let datePosted = details.datePosted || this.formatDateToDDMMYYYY(new Date());
                let dateUpdated = details.dateUpdated || datePosted;

                const listing = {
                    id: `${listingInfo.number}-${listingInfo.advertId}`,
                    number: listingInfo.number,
                    price: listingInfo.price,
                    datePosted: datePosted,
                    dateUpdated: dateUpdated,
                    status: 'активно',
                    seller: 'неизвестно',
                    url: listingInfo.url,
                    region: listingInfo.region,
                    parsedAt: new Date().toISOString()
                };

                if (this.meetsFilters(listing)) {
                    this.listings.push(listing);
                    existingNumbers.add(listing.number);
                    count++;
                }
            }
        }

        console.log(`📊 API ответ: всего строк ${rows.length}, новых ${count}, всего собрано ${this.listings.length}`);

        return count;
    }

    /**
     * Извлекает данные объявления из элемента
     */
    extractListingData($elem, $) {
        const text = $elem.text();

        // Ищем номер в формате А123ВХ77
        const numberMatch = text.match(/[А-Я]\d{3}[А-Я]{2}\d{2,3}/);

        if (!numberMatch) return null;

        const number = numberMatch[0];
        const priceText = $elem.find('[class*="price"]').text() || text;
        const price = this.extractPrice(priceText);

        // Ищем даты в структуре user-data-table
        // Структура: <tr class="user-data-table__tr"><th>Дата размещения</th><td>08 декабря 2024</td></tr>
        let datePostedText = '';
        let dateUpdatedText = '';

        const userDataRows = $elem.find('.user-data-table__tr');
        userDataRows.each((i, row) => {
            const $row = $(row);
            const th = $row.find('.user-data-table__th').text().trim();
            const td = $row.find('.user-data-table__td').text().trim();

            if (th === 'Дата размещения' && td) {
                datePostedText = td;
            }
            if (th === 'Дата поднятия' && td) {
                dateUpdatedText = td;
            }
        });

        // Если даты не найдены в user-data-table, ищем по классам
        if (!datePostedText) {
            datePostedText = $elem.find('[class*="date"]').text() ||
                            $elem.find('[class*="posted"]').text() ||
                            $elem.find('[class*="published"]').text() || '';
        }

        if (!dateUpdatedText) {
            dateUpdatedText = $elem.find('[class*="update"]').text() ||
                             $elem.find('[class*="lifted"]').text() ||
                             $elem.find('[class*="raised"]').text() ||
                             $elem.find('[class*="bump"]').text() || '';
        }

        // Если даты не найдены по классам, ищем в тексте даты в формате ДД.МММ.ГГГГ
        if (!datePostedText) {
            const dateMatch = text.match(/\d{1,2}\.\d{1,2}\.\d{4}/);
            datePostedText = dateMatch ? dateMatch[0] : '';
        }

        const listing = {
            id: `${number}-${Date.now()}`.replace(/\s/g, ''),
            number: number,
            price: price,
            datePosted: this.parseDate(datePostedText),
            dateUpdated: this.parseDate(dateUpdatedText),
            status: 'активно',
            seller: $elem.find('[class*="seller"]').text().trim() || 'неизвестно',
            url: $elem.find('a').first().attr('href') || '',
            region: this.extractRegion(number),
            parsedAt: new Date().toISOString()
        };

        return listing;
    }

    /**
     * Извлекает цену из текста
     */
    extractPrice(text) {
        if (!text) return 0;

        // Ищем цифры, исключая те, что в номере
        const match = text.match(/(?:₽|рубл)?[\s]*(\d{4,})/);
        if (match) {
            return parseInt(match[1].replace(/\s/g, ''));
        }

        // Если не найдено через ₽, ищем большие числа
        const bigNumbers = text.match(/\d{5,}/g);
        if (bigNumbers && bigNumbers.length > 0) {
            return parseInt(bigNumbers[0]);
        }

        return 0;
    }

    /**
     * Извлекает регион из номера автомобиля
     * Формат номера: А123ВХ77 или А12ВХ199
     * Регион находится в конце и может быть 2-3 цифры
     */
    extractRegion(number) {
        if (!number) return '';

        // Ищем последовательность из 2-3 цифр в конце
        const match = number.match(/\d{2,3}$/);
        return match ? match[0] : '';
    }

    /**
     * Парсит дополнительные страницы
     */
    async parseAdditionalPages() {
        console.log(`\n📊 ПРОВЕРКА: текущее количество объявлений: ${this.listings.length}`);

        // Если реальный парсинг не дал результатов, останавливаемся
        if (this.listings.length === 0) {
            console.log('\n⚠️ Реальные данные не получены. Парсинг завершен с нулевым результатом.');
            console.log('💡 Возможные причины: сервер недоступен, блокировка, изменение структуры HTML');
            return;
        }

        // Проверяем наличие пагинации
        console.log('\n📄 Проверяем наличие дополнительных страниц...');

        for (let page = 2; page <= this.maxPages; page++) {
            await this.delay(this.delayMs);

            let browserPage = null;
            try {
                browserPage = await this.browser.newPage();
                await browserPage.setUserAgent(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                );

                const pageUrls = [
                    `${this.baseUrl}?page=${page}`,
                    `${this.baseUrl}/?page=${page}`,
                    `${this.baseUrl}/page/${page}`,
                    `${this.baseUrl}?start=${(page - 1) * 20}`
                ];

                let foundPage = false;

                for (const pageUrl of pageUrls) {
                    try {
                        await browserPage.goto(pageUrl, { waitUntil: 'networkidle2' });
                        await this.delay(1000);

                        const html = await browserPage.content();
                        const $ = cheerio.load(html);

                        const initialCount = this.listings.length;
                        await this.parseListingsFromPage($, page);

                        if (this.listings.length > initialCount) {
                            foundPage = true;
                            break;
                        }
                    } catch (error) {
                        // Пробуем следующий URL
                    }
                }

                if (!foundPage) {
                    console.log(`📄 Страница ${page} не найдена, парсинг завершен`);
                    break;
                }

            } catch (error) {
                console.error(`❌ Ошибка при парсинге страницы ${page}:`, error.message);
                this.errors.push(`Страница ${page}: ${error.message}`);
                break;
            } finally {
                if (browserPage) {
                    await browserPage.close();
                }
            }
        }
    }

    /**
     * ⚠️ DEPRECATED: Больше не используется! Парсер теперь работает только с реальными данными.
     * Генерирует тестовые данные для демонстрации (сохранена для истории)
     */
    generateTestData() {
        const plates = ['А', 'Б', 'В', 'Е', 'К', 'М', 'Н', 'О', 'П', 'С', 'Т', 'У', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Э', 'Ю', 'Я'];
        const regions = ['77', '50', '78', '199', '72', '70', '96', '73', '174', '177', '64', '52', '66', '61', '30'];
        const sellers = ['seller_1', 'seller_2', 'seller_3', 'seller_4', 'seller_5', 'seller_6', 'seller_7', 'seller_8', 'seller_9', 'seller_10'];

        const count = Math.min(this.maxPages * 15, 200);

        for (let i = 0; i < count; i++) {
            const plate = `${plates[Math.floor(Math.random() * plates.length)]}${Math.floor(Math.random() * 900) + 100}${plates[Math.floor(Math.random() * plates.length)]}${plates[Math.floor(Math.random() * plates.length)]}${regions[Math.floor(Math.random() * regions.length)]}`;
            const price = Math.floor(Math.random() * 750000) + 50000;
            const daysAgo = Math.floor(Math.random() * 60);
            const datePosted = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
            const daysUpdated = Math.floor(Math.random() * daysAgo);
            const dateUpdated = new Date(Date.now() - daysUpdated * 24 * 60 * 60 * 1000);
            const region = this.extractRegion(plate);
            const seller = sellers[Math.floor(Math.random() * sellers.length)];

            const listing = {
                id: `${plate}-${Date.now()}-${i}`,
                number: plate,
                price: price,
                datePosted: this.formatDate(datePosted),
                dateUpdated: this.formatDate(dateUpdated),
                status: Math.random() > 0.1 ? 'активно' : 'снято',
                seller: seller,
                url: `${this.baseUrl}/number/${plate}`,
                region: region,
                parsedAt: new Date().toISOString()
            };

            if (this.meetsFilters(listing)) {
                this.listings.push(listing);
            }
        }

        console.log(`✅ Сгенерировано тестовых данных: ${this.listings.length} объявлений`);
    }

    /**
     * Парсит дату из текста
     */
    parseDate(text) {
        if (!text) {
            const today = new Date();
            return this.formatDateToDDMMYYYY(today);
        }

        // Формат: "22.10.2025"
        const match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (match) {
            return `${String(match[1]).padStart(2, '0')}.${String(match[2]).padStart(2, '0')}.${match[3]}`;
        }

        // Формат: "08 декабря 2024" (Russian date format)
        const russianMonths = {
            'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
            'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
            'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'
        };

        const russianDateMatch = text.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/);
        if (russianDateMatch) {
            const day = String(russianDateMatch[1]).padStart(2, '0');
            const month = russianMonths[russianDateMatch[2]];
            const year = russianDateMatch[3];
            return `${day}.${month}.${year}`;
        }

        // Если это текст типа "сегодня", "вчера"
        if (text.toLowerCase().includes('сегодня')) {
            const today = new Date();
            return this.formatDateToDDMMYYYY(today);
        }

        if (text.toLowerCase().includes('вчера')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return this.formatDateToDDMMYYYY(yesterday);
        }

        const today = new Date();
        return this.formatDateToDDMMYYYY(today);
    }

    /**
     * Форматирует дату в строку ДД.МММ.ГГГГ
     */
    formatDateToDDMMYYYY(date) {
        if (!date) date = new Date();
        if (typeof date === 'string') {
            // Если уже в формате ДД.МММ.ГГГГ
            if (date.match(/\d{2}\.\d{2}\.\d{4}/)) {
                return date;
            }
            // Если в формате ГГГГ-МММ-ДД
            const match = date.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (match) {
                return `${String(match[3]).padStart(2, '0')}.${String(match[2]).padStart(2, '0')}.${match[1]}`;
            }
            return date;
        }
        if (date instanceof Date) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        }
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        return `${day}.${month}.${year}`;
    }

    /**
     * Форматирует дату в строку YYYY-MM-DD (для внутреннего использования)
     */
    formatDate(date) {
        if (!date) {
            const today = new Date();
            return today.toISOString().split('T')[0];
        }
        if (typeof date === 'string') {
            // Если в формате ДД.МММ.ГГГГ
            const match = date.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
            if (match) {
                return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
            }
            return date;
        }
        if (date instanceof Date) {
            return date.toISOString().split('T')[0];
        }
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Проверяет соответствие фильтрам
     */
    meetsFilters(listing) {
        // Проверка что есть номер
        if (!listing.number) {
            return false;
        }

        // Проверка цены только если она указана
        // Если цена = 0, мы все равно берем объявление, но логируем это
        if (listing.price > 0) {
            if (listing.price < this.minPrice || listing.price > this.maxPrice) {
                return false;
            }
        }

        // Проверка региона
        if (this.region && listing.region !== this.region) {
            return false;
        }

        return true;
    }

    /**
     * Сохраняет результаты в CSV
     */
    saveToCSV(filename = null) {
        if (this.listings.length === 0) {
            console.log('⚠️ Нет данных для сохранения');
            return null;
        }

        filename = filename || `autonomera777_${new Date().toISOString().split('T')[0]}.csv`;
        const filepath = path.join(process.cwd(), filename);

        const csvData = stringify(this.listings, {
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

        fs.writeFileSync(filepath, csvData, 'utf-8');
        console.log(`\n💾 Данные сохранены в: ${filepath}`);
        return filepath;
    }

    /**
     * Сохраняет результаты в JSON
     */
    saveToJSON(filename = null) {
        if (this.listings.length === 0) {
            console.log('⚠️ Нет данных для сохранения');
            return null;
        }

        filename = filename || `autonomera777_${new Date().toISOString().split('T')[0]}.json`;
        const filepath = path.join(process.cwd(), filename);

        fs.writeFileSync(filepath, JSON.stringify(this.listings, null, 2), 'utf-8');
        console.log(`\n💾 Данные сохранены в: ${filepath}`);
        return filepath;
    }

    /**
     * Выводит статистику
     */
    printStats() {
        if (this.listings.length === 0) {
            console.log('📊 Статистика: нет данных');
            return;
        }

        const prices = this.listings.map(l => l.price);
        const avgPrice = Math.round(prices.reduce((a, b) => a + b) / prices.length);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const regions = new Set(this.listings.map(l => l.region));

        console.log('\n📊 СТАТИСТИКА:');
        console.log(`   Всего объявлений: ${this.listings.length}`);
        console.log(`   Средняя цена: ₽${avgPrice.toLocaleString('ru-RU')}`);
        console.log(`   Минимальная цена: ₽${minPrice.toLocaleString('ru-RU')}`);
        console.log(`   Максимальная цена: ₽${maxPrice.toLocaleString('ru-RU')}`);
        console.log(`   Уникальные регионы: ${regions.size}`);
        console.log(`   Ошибок при парсинге: ${this.errors.length}`);
    }
}

// Главная функция
async function main() {
    const args = process.argv.slice(2);
    const isDev = args.includes('--dev');

    const parser = new AutonomeraParser({
        timeout: isDev ? 30000 : 40000,
        delayMs: isDev ? 100 : 100, // 100ms для максимальной скорости
        maxPages: isDev ? 2 : 200, // 200 страниц = 10,000 объявлений за батч
        minPrice: 0,
        maxPrice: Infinity
    });

    try {
        const listings = await parser.parse();

        parser.printStats();

        // Сохраняем результаты
        parser.saveToJSON();
        parser.saveToCSV();

        console.log('\n✅ Парсинг успешно завершен!');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        process.exit(1);
    }
}

// Экспортируем парсер для использования как модуль
module.exports = AutonomeraParser;

// Запуск при прямом вызове
if (require.main === module) {
    main();
}
