const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');

class AutonomeraParser {
    constructor(options = {}) {
        this.baseUrl = 'https://autonomera777.net';
        this.timeout = options.timeout || 10000;
        this.delayMs = options.delayMs || 1000;
        this.maxPages = options.maxPages || 50;
        this.minPrice = options.minPrice || 0;
        this.maxPrice = options.maxPrice || Infinity;
        this.region = options.region || null;
        this.listings = [];
        this.errors = [];
    }

    /**
     * Создает конфиг для axios с пользовательским User-Agent
     */
    getAxiosConfig() {
        return {
            timeout: this.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };
    }

    /**
     * Задержка между запросами для respectful scraping
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Главная функция парсинга
     */
    async parse() {
        console.log('🚀 Начинаем парсинг АВТОНОМЕРА777...');
        console.log(`📊 Параметры: цена ${this.minPrice}-${this.maxPrice}, регион: ${this.region || 'все'}`);

        try {
            // Парсим главную страницу
            await this.parseMainPage();

            // Если есть пагинация - парсим остальные страницы
            await this.parseAdditionalPages();

            console.log(`\n✅ Парсинг завершен!`);
            console.log(`📈 Всего объявлений: ${this.listings.length}`);
            console.log(`❌ Ошибок: ${this.errors.length}`);

            return this.listings;

        } catch (error) {
            console.error('❌ Критическая ошибка при парсинге:', error.message);
            throw error;
        }
    }

    /**
     * Парсит главную страницу
     */
    async parseMainPage() {
        console.log('\n📄 Загружаем главную страницу...');

        try {
            const response = await axios.get(this.baseUrl, this.getAxiosConfig());
            const $ = cheerio.load(response.data);

            // Парсим таблицу объявлений
            this.parseListingsTable($, 1);

        } catch (error) {
            const msg = `Ошибка при загрузке главной страницы: ${error.message}`;
            console.error('❌', msg);
            this.errors.push(msg);
        }
    }

    /**
     * Парсит таблицу объявлений из HTML
     */
    parseListingsTable($, pageNumber) {
        let count = 0;

        // Ищем таблицу с номерами (может быть разная структура)
        // Попытка 1: поиск по классам таблицы
        const rows = $('table tbody tr, .listings-table tbody tr, .numbers-list > tr');

        if (rows.length === 0) {
            console.log('⚠️ Таблица не найдена через основные селекторы');
            // Альтернативный поиск - по содержимому
            this.parseListingsAlternative($, pageNumber);
            return;
        }

        rows.each((index, element) => {
            try {
                const listing = this.parseListingRow($, element);
                if (listing && this.meetsFilters(listing)) {
                    this.listings.push(listing);
                    count++;
                }
            } catch (error) {
                console.error(`⚠️ Ошибка парсинга строки ${index + 1}:`, error.message);
            }
        });

        console.log(`✅ Страница ${pageNumber}: найдено ${count} объявлений`);
    }

    /**
     * Альтернативный парсинг объявлений
     */
    parseListingsAlternative($, pageNumber) {
        console.log('🔍 Используем альтернативный метод парсинга...');

        let count = 0;

        // Ищем ссылки на объявления (обычно это номера)
        const patterns = [
            { selector: 'a[href*="/number/"]', isList: false },
            { selector: '.listing-item', isList: false },
            { selector: '[data-listing-id]', isList: false },
            { selector: '.announcement', isList: false }
        ];

        for (const pattern of patterns) {
            const elements = $(pattern.selector);
            if (elements.length > 0) {
                console.log(`📌 Найденно ${elements.length} элементов по селектору: ${pattern.selector}`);

                elements.each((index, element) => {
                    try {
                        const $element = $(element);
                        const listing = this.parseListingElement($, $element);
                        if (listing && this.meetsFilters(listing)) {
                            // Проверяем, не добавляли ли мы уже такой номер
                            if (!this.listings.find(l => l.number === listing.number)) {
                                this.listings.push(listing);
                                count++;
                            }
                        }
                    } catch (error) {
                        // Не логируем ошибки при альтернативном парсинге
                    }
                });

                if (count > 0) break;
            }
        }

        if (count === 0) {
            console.log('⚠️ Не удалось найти объявления');
        }
    }

    /**
     * Парсит одну строку таблицы
     */
    parseListingRow($, element) {
        const $row = $(element);
        const cells = $row.find('td');

        if (cells.length < 4) return null;

        const datePosted = this.parseDate($(cells[0]).text());
        const numberText = $(cells[1]).text().trim();
        const priceText = $(cells[2]).text().trim();
        const seller = $(cells[3]).text().trim();

        // Ищем ссылку на объявление
        const $link = $row.find('a[href*="/number/"], a[href*="номер"]');
        const url = $link.length > 0 ? this.baseUrl + $link.attr('href') : '';

        return {
            id: this.generateId(numberText),
            number: numberText,
            price: this.parsePrice(priceText),
            datePosted: datePosted,
            dateUpdated: datePosted, // изначально совпадает с датой размещения
            status: 'активно',
            seller: seller,
            url: url,
            region: this.extractRegion(numberText),
            parsedAt: new Date().toISOString()
        };
    }

    /**
     * Парсит элемент объявления (альтернативный метод)
     */
    parseListingElement($, $element) {
        const listing = {
            id: '',
            number: '',
            price: 0,
            datePosted: new Date().toISOString().split('T')[0],
            dateUpdated: new Date().toISOString().split('T')[0],
            status: 'активно',
            seller: 'неизвестно',
            url: '',
            region: '',
            parsedAt: new Date().toISOString()
        };

        // Номер - обычно это текст ссылки или в href
        const $link = $element.find('a').first();
        if ($link.length > 0) {
            listing.number = $link.text().trim();
            listing.url = $link.attr('href');
            if (!listing.url.startsWith('http')) {
                listing.url = this.baseUrl + listing.url;
            }
        } else {
            listing.number = $element.text().trim();
        }

        // Цена
        const priceText = $element.find('[class*="price"]').text() ||
                         $element.attr('data-price') ||
                         '';
        listing.price = this.parsePrice(priceText);

        // Продавец
        const sellerText = $element.find('[class*="seller"]').text() ||
                          $element.attr('data-seller') ||
                          'неизвестно';
        listing.seller = sellerText.trim();

        // Дата
        const dateText = $element.find('[class*="date"]').text() ||
                        $element.attr('data-date') ||
                        '';
        listing.datePosted = this.parseDate(dateText);

        // Регион
        listing.region = this.extractRegion(listing.number);
        listing.id = this.generateId(listing.number);

        return listing;
    }

    /**
     * Парсит дополнительные страницы
     */
    async parseAdditionalPages() {
        // Проверяем наличие пагинации
        console.log('\n📄 Проверяем наличие дополнительных страниц...');

        for (let page = 2; page <= this.maxPages; page++) {
            await this.delay(this.delayMs);

            try {
                // Пробуем разные форматы URL для пагинации
                const pageUrls = [
                    `${this.baseUrl}?page=${page}`,
                    `${this.baseUrl}/?page=${page}`,
                    `${this.baseUrl}/page/${page}`,
                    `${this.baseUrl}?start=${(page - 1) * 20}`
                ];

                let foundPage = false;

                for (const pageUrl of pageUrls) {
                    try {
                        const response = await axios.get(pageUrl, this.getAxiosConfig());
                        const $ = cheerio.load(response.data);

                        const initialCount = this.listings.length;
                        this.parseListingsTable($, page);

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
            }
        }
    }

    /**
     * Парсит цену из текста
     */
    parsePrice(text) {
        const match = text.match(/(\d+[\s\d]*)/);
        if (match) {
            return parseInt(match[1].replace(/\s/g, ''));
        }
        return 0;
    }

    /**
     * Парсит дату из текста
     */
    parseDate(text) {
        // Формат: "22.10.2025"
        const match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (match) {
            return `${match[3]}-${match[2]}-${match[1]}`;
        }

        // Если это текст типа "сегодня", "вчера"
        if (text.toLowerCase().includes('сегодня')) {
            const today = new Date();
            return today.toISOString().split('T')[0];
        }

        if (text.toLowerCase().includes('вчера')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return yesterday.toISOString().split('T')[0];
        }

        // Дефолтная дата
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Извлекает код региона из номера
     */
    extractRegion(number) {
        // Номер формата: Р550ВХ550
        // Регион обычно в конце (последние 2-3 цифры)
        const match = number.match(/(\d{2,3})$/);
        return match ? match[1] : '';
    }

    /**
     * Генерирует уникальный ID
     */
    generateId(number) {
        return `${number}-${Date.now()}`.replace(/\s/g, '');
    }

    /**
     * Проверяет соответствие фильтрам
     */
    meetsFilters(listing) {
        // Проверка цены
        if (listing.price < this.minPrice || listing.price > this.maxPrice) {
            return false;
        }

        // Проверка региона
        if (this.region && listing.region !== this.region) {
            return false;
        }

        // Проверка что есть номер и цена
        if (!listing.number || listing.price === 0) {
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
        timeout: 15000,
        delayMs: isDev ? 100 : 1000,
        maxPages: isDev ? 2 : 50,
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
