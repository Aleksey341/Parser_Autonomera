# 🔄 Как работает парсер с БД

Подробное объяснение всех процессов взаимодействия парсера с базой данных.

---

## 📋 Содержание

1. [Архитектура системы](#архитектура-системы)
2. [Полный поток данных](#полный-поток-данных)
3. [Три режима работы](#три-режима-работы)
4. [Таблицы БД](#таблицы-бд)
5. [Сессии парсинга](#сессии-парсинга)

---

## Архитектура системы

```
┌─────────────────────────────────────────────────────────────────┐
│                         EXPRESS APP (server.js)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ POST /api/parse                                          │   │
│  │ POST /api/parse-differential                            │   │
│  │ GET  /api/sessions/:id/status                           │   │
│  │ GET  /api/sessions/:id/data                             │   │
│  │ GET  /api/price-changes                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
                    ┌─────────────────────────────┐
                    │  PARSER (parser.js)         │
                    │ - Puppeteer браузер         │
                    │ - Cheerio парсинг HTML      │
                    │ - Параллельные запросы      │
                    │ - Батч-продолжение         │
                    └─────────────────────────────┘
                                  ↓
                    ┌─────────────────────────────┐
                    │ PARSER-DB ADAPTER           │
                    │ (parser-db.js)              │
                    │ - Управление сессиями       │
                    │ - Сохранение в БД           │
                    │ - Дифференциальное сравнение│
                    └─────────────────────────────┘
                                  ↓
        ┌─────────────────────────────────────────────┐
        │         DATABASE LAYER (db.js / db-pg.js)    │
        │  ┌──────────────┐  ┌──────────────────────┐ │
        │  │ MySQL (db.js)│  │PostgreSQL(db-pg.js) │ │
        │  │              │  │                      │ │
        │  │ connections  │  │ connection pooling   │ │
        │  │ queries      │  │ queries              │ │
        │  └──────────────┘  └──────────────────────┘ │
        └─────────────────────────────────────────────┘
                                  ↓
        ┌─────────────────────────────────────────────┐
        │              DATABASE                        │
        │  ┌──────────────┐  ┌──────────────────────┐ │
        │  │ listings     │  │ parse_sessions       │ │
        │  │ (объявления) │  │ (истории парсинга)  │ │
        │  ├──────────────┤  └──────────────────────┘ │
        │  │ number       │  ┌──────────────────────┐ │
        │  │ price        │  │ price_history        │ │
        │  │ region       │  │ (история цен)        │ │
        │  │ status       │  └──────────────────────┘ │
        │  │ url          │  ┌──────────────────────┐ │
        │  │ parsed_at    │  │ cron_logs            │ │
        │  │ updated_at   │  │ (логи автопарсинга)  │ │
        │  └──────────────┘  └──────────────────────┘ │
        └─────────────────────────────────────────────┘
```

---

## Полный поток данных

### Шаг 1️⃣: Инициализация парсинга

**Пользователь отправляет запрос:**

```bash
POST /api/parse-differential
{
  "maxPages": 50,
  "minPrice": 100000,
  "maxPrice": 500000
}
```

**Что происходит в server.js:**

```javascript
// 1. Генерируется уникальный ID сессии
const sessionId = "session_1735404000000_abc123def";

// 2. Создается парсер с параметрами
const parser = new AutonomeraParser({
  maxPages: 50,
  minPrice: 100000,
  maxPrice: 500000,
  concurrentRequests: 500
});

// 3. Сессия сохраняется в памяти
sessions.set(sessionId, {
  parser,
  status: 'running',
  progress: 0,
  startTime: Date.now(),
  isDifferential: true
});

// 4. Возвращаем ID пользователю
res.json({ sessionId, status: 'started' });
```

**Пользователь получает:**
```json
{
  "sessionId": "session_1735404000000_abc123def",
  "status": "started",
  "message": "Парсинг начался"
}
```

---

### Шаг 2️⃣: Запуск парсинга

**Асинхронно запускается парсинг:**

```javascript
// server.js
runDifferentialParserWithDB(parser, sessionId)
  .then(result => { /* успех */ })
  .catch(error => { /* ошибка */ });
```

**В parser-db.js:**

```javascript
async function runDifferentialParserWithDB(parser, sessionId) {
  // 1. Инициализируем браузер
  await parser.initBrowser();

  // 2. Создаем сессию в БД
  await adapter.startSession({ sessionId });

  // 3. ЗАПУСКАЕМ ПАРСИНГ
  const result = await parser.parse();

  // 4. СРАВНИВАЕМ С БД (дифференциальное сравнение)
  const diffResult = await adapter.saveDifferentialListingsToDB();

  // 5. Завершаем сессию
  await adapter.completeSession();

  // 6. Закрываем браузер
  await parser.closeBrowser();
}
```

---

### Шаг 3️⃣: Парсинг сайта (parser.js)

**Парсер загружает сайт и скрейпит данные:**

```javascript
async parse() {
  console.log('🌐 Парсим страницу 1...');

  // Открываем браузер и переходим на сайт
  await this.page.goto(this.baseUrl, { waitUntil: 'networkidle2' });

  // Парсим объявления со страницы
  const listings = await this.page.evaluate(() => {
    return document.querySelectorAll('.listing').map(el => ({
      number: el.querySelector('.number').textContent,
      price: parseInt(el.querySelector('.price').textContent),
      region: el.querySelector('.region').textContent,
      url: el.querySelector('a').href,
      status: 'active'
    }));
  });

  // Добавляем в this.listings
  this.listings = [...this.listings, ...listings];

  // Переходим на следующую страницу (батчи по 500)
  // Если достигли maxPages, парсинг заканчивается
}
```

**Результат: this.listings содержит все спарсенные объявления**

```javascript
[
  {
    number: 'А123ВХ77',
    price: 250000,
    region: 'Москва',
    url: 'https://autonomera777.net/...',
    status: 'active'
  },
  {
    number: 'В456DE99',
    price: 300000,
    region: 'СПб',
    url: 'https://autonomera777.net/...',
    status: 'active'
  },
  // ... 5000+ объявлений
]
```

---

### Шаг 4️⃣: Дифференциальное сравнение

**В parser-db.js: saveDifferentialListingsToDB()**

```javascript
async saveDifferentialListingsToDB() {
  // Получаем спарсенные объявления
  const newListings = this.parser.listings; // 5000 объявлений

  // ✅ ГЛАВНЫЙ МОМЕНТ: Вызываем дифференциальное сравнение
  const diffResult = await db.getDifferentialListings(
    newListings,
    this.sessionId
  );

  return diffResult;
}
```

**В db-pg.js: getDifferentialListings()**

```javascript
async getDifferentialListings(newListings, sessionId) {
  // 1️⃣ Получаем все СУЩЕСТВУЮЩИЕ номера из БД
  const existingNumbers = await getExistingNumbers();
  // Результат: { 'А123ВХ77': 250000, 'В456DE99': 280000, ... }

  // 2️⃣ Сравниваем каждое спарсенное объявление
  const newListingsArray = [];
  const priceChanges = [];

  for (const listing of newListings) {
    const existingPrice = existingNumbers[listing.number];

    if (existingPrice === undefined) {
      // ✨ НОВОЕ объявление! Его еще нет в БД
      newListingsArray.push(listing);
    } else if (listing.price !== existingPrice) {
      // 📊 Цена ИЗМЕНИЛАСЬ! Записываем в history
      await recordPriceChange(
        listing.number,
        existingPrice,      // старая цена
        listing.price,      // новая цена
        sessionId
      );
      priceChanges.push({
        number: listing.number,
        oldPrice: existingPrice,
        newPrice: listing.price,
        priceDelta: listing.price - existingPrice,
        changeDirection: listing.price > existingPrice ? 'increased' : 'decreased'
      });
    }
    // Остальное: цена не изменилась, игнорируем
  }

  // 3️⃣ Возвращаем результаты
  return {
    newListings: newListingsArray,        // только НОВЫЕ
    priceChanges: priceChanges,           // только ИЗМЕНЕННЫЕ
    statistics: {
      newCount: newListingsArray.length,
      updatedCount: priceChanges.length,
      unchangedCount: newListings.length - newListingsArray.length - priceChanges.length
    }
  };
}
```

---

### Шаг 5️⃣: Сохранение в БД

**Для новых объявлений: insertOrUpdateListing()**

```javascript
async insertOrUpdateListing(listingData) {
  // PostgreSQL: ON CONFLICT ... DO UPDATE
  // MySQL: ON DUPLICATE KEY UPDATE

  await db.query(`
    INSERT INTO listings (number, price, region, status, url, parsed_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (number) DO UPDATE SET
      price = EXCLUDED.price,
      parsed_at = NOW()
  `, [data.number, data.price, ...]);
}
```

**Для истории цен: recordPriceChange()**

```javascript
async recordPriceChange(number, oldPrice, newPrice, sessionId) {
  await db.query(`
    INSERT INTO price_history (number, old_price, new_price, price_delta, change_direction, session_id)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [number, oldPrice, newPrice, newPrice - oldPrice, direction, sessionId]);
}
```

---

### Шаг 6️⃣: Завершение сессии

**updateParseSession()**

```javascript
async updateParseSession(sessionId, {
  status: 'completed',
  totalItems: 5000,
  newItems: 150,
  updatedItems: 45,
  unchangedItems: 4805
})

// Обновляется запись в БД:
// UPDATE parse_sessions SET status='completed', ...
```

**Обновляется сессия в памяти:**

```javascript
session.status = 'completed';
session.listings = result.newListings;        // 150 новых
session.priceChanges = result.priceChanges;   // 45 изменений
session.diffResult = result;                  // полная статистика
session.endTime = Date.now();
```

---

### Шаг 7️⃣: Возврат результатов пользователю

**Пользователь проверяет статус:**

```bash
GET /api/sessions/session_1735404000000_abc123def/status
```

**Получает:**

```json
{
  "sessionId": "session_1735404000000_abc123def",
  "status": "completed",
  "isDifferential": true,
  "differential": {
    "totalParsed": 5000,
    "newItems": 150,
    "updatedItems": 45,
    "unchangedItems": 4805,
    "priceChangesCount": 45
  },
  "duration": "45s"
}
```

**Пользователь получает данные:**

```bash
GET /api/sessions/session_1735404000000_abc123def/data
```

**Получает:**

```json
{
  "isDifferential": true,
  "count": 150,  // только НОВЫЕ
  "listings": [
    {
      "number": "З789МХ99",
      "price": 180000,
      "region": "Казань",
      ...
    },
    ...
  ],
  "priceChangesCount": 45,
  "priceChanges": [
    {
      "number": "А456DE99",
      "oldPrice": 300000,
      "newPrice": 280000,
      "priceDelta": -20000,
      "changeDirection": "decreased"
    },
    ...
  ],
  "priceChangesSummary": {
    "total": 45,
    "increased": 30,
    "decreased": 15,
    "totalPriceDelta": 125000
  }
}
```

---

## Три режима работы

### 1️⃣ Обычный парсинг: `/api/parse`

```
autonomera777.net
        ↓
   parser.parse()
        ↓
  this.listings = [5000 объявлений]
        ↓
  ❌ БЕЗ сравнения!
        ↓
  insertOrUpdateListing() для ВСЕХ 5000
        ↓
  📊 Результат:
     - Новых: 150
     - Обновлено: 4850 (перезаписаны все цены)
```

**Когда использовать:** Первый запуск, полное обновление

---

### 2️⃣ Дифференциальный парсинг: `/api/parse-differential`

```
autonomera777.net
        ↓
   parser.parse()
        ↓
  this.listings = [5000 объявлений]
        ↓
  getDifferentialListings()
    ├─ getExistingNumbers() из БД
    ├─ Сравнение новых с существующими
    ├─ recordPriceChange() для измененных
    └─ Возврат только новых + измененных
        ↓
  insertOrUpdateListing() ТОЛЬКО для 150 новых
        ↓
  📊 Результат:
     - Новых: 150 (только добавлены)
     - Изменены цены: 45 (в price_history)
     - Без изменений: 4805 (не трогали)
```

**Когда использовать:** Регулярные обновления, мониторинг цен

---

### 3️⃣ Автоматический парсинг: `scheduler.js`

```
00:00 (полночь по расписанию)
        ↓
  scheduler запускает парсинг
        ↓
  scheduledParseTask()
        ↓
  runParserWithDB() (обычный, не дифференциальный)
        ↓
  Сохраняет логи в cron_logs
        ↓
  📊 Результат записывается в БД
```

**Когда происходит:** Каждый день в 00:00 (или как настроено в .env)

---

## Таблицы БД

### 📋 listings (основные объявления)

```
id                INTEGER PRIMARY KEY      Уникальный ID
number            VARCHAR(15) UNIQUE       А123ВХ77
price             INTEGER                  250000
region            VARCHAR(100)             Москва
status            VARCHAR(50)              'active'/'inactive'
date_posted       TIMESTAMP                2025-01-20 10:30:00
date_updated      TIMESTAMP                2025-01-20 15:45:00
seller            VARCHAR(255)             Имя продавца
url               VARCHAR(500) UNIQUE      https://...
parsed_at         TIMESTAMP                2025-01-20 15:45:00
updated_at        TIMESTAMP                2025-01-20 15:45:00

INDEX: number, region, status, price, updated_at
```

**Пример данных:**
```
А123ВХ77 | 250000 | Москва | active | 2025-01-20 15:45:00
В456DE99 | 280000 | СПб    | active | 2025-01-20 15:40:00
З789МХ99 | 180000 | Казань | active | 2025-01-20 15:30:00
```

---

### 📊 price_history (история изменений цен)

```
id                SERIAL PRIMARY KEY       Уникальный ID
number            VARCHAR(15)              А123ВХ77
old_price         INTEGER                  240000
new_price         INTEGER                  250000
price_delta       INTEGER                  10000
change_direction  VARCHAR(20)              'increased'
updated_at        TIMESTAMP                2025-01-20 15:45:00
session_id        VARCHAR(36)              session_1735404000000_abc123def

INDEX: number, updated_at, session_id
```

**Пример истории:**
```
А123ВХ77 | 240000 → 250000 | +10000 | increased | 2025-01-20 15:45:00 | session_...
А123ВХ77 | 230000 → 240000 | +10000 | increased | 2025-01-19 15:45:00 | session_...
А123ВХ77 | 200000 → 230000 | +30000 | increased | 2025-01-18 15:45:00 | session_...
```

---

### 🕐 parse_sessions (истории парсинга)

```
id                VARCHAR(36) PRIMARY KEY  session_1735404000000_abc123def
started_at        TIMESTAMP                2025-01-20 15:30:00
completed_at      TIMESTAMP                2025-01-20 15:45:00
status            VARCHAR(50)              'completed'/'running'/'failed'
total_items       INTEGER                  5000
new_items         INTEGER                  150
updated_items     INTEGER                  45
params            JSONB                    {"maxPages": 50, "region": null}
error             TEXT                     NULL

INDEX: status, started_at
```

---

### 🤖 cron_logs (логи автопарсинга)

```
id                SERIAL PRIMARY KEY       Уникальный ID
scheduled_time    TIMESTAMP                2025-01-20 00:00:00
started_at        TIMESTAMP                2025-01-20 00:00:05
completed_at      TIMESTAMP                2025-01-20 00:15:30
status            VARCHAR(50)              'completed'/'running'/'failed'
items_processed   INTEGER                  3500
error             TEXT                     NULL

INDEX: started_at, status
```

---

## Сессии парсинга

### В памяти (server.js)

```javascript
// Пока парсинг работает, сессия в памяти
sessions.set(sessionId, {
  parser: AutonomeraParser { ... },      // сам парсер
  status: 'running',                      // статус
  progress: 35,                           // прогресс %
  startTime: 1735404000000,              // когда начал
  endTime: null,                          // когда закончил
  isDifferential: true,                   // дифференциальный?
  listings: [],                           // результаты
  priceChanges: [],                       // изменения цен
  diffResult: { ... }                     // полная статистика
});
```

### В БД (parse_sessions)

```
После завершения сессия сохраняется в БД для истории:

id: session_1735404000000_abc123def
started_at: 2025-01-20 15:30:00
completed_at: 2025-01-20 15:45:00
status: completed
total_items: 5000
new_items: 150
updated_items: 45
params: {"maxPages": 50, "isDifferential": true}
error: NULL
```

---

## Полный жизненный цикл объявления

### 🆕 Новое объявление при дифференциальном парсинге

```
1. Парсинг находит: А999ХХ99, цена 150000

2. getDifferentialListings() проверяет:
   "Есть ли А999ХХ99 в БД?"
   → Нет!

3. Добавляется в newListings

4. insertOrUpdateListing() вставляет в БД:
   INSERT INTO listings (number, price, ...)
   VALUES ('А999ХХ99', 150000, ...)

5. Объявление теперь в БД с parsed_at = NOW()
```

---

### 📈 Объявление с изменением цены

```
1. Парсинг находит: А123ВХ77, цена 250000

2. getDifferentialListings() проверяет:
   "Есть ли А123ВХ77 в БД?"
   → Да! Старая цена: 240000

3. Цены не совпадают:
   240000 ≠ 250000

4. recordPriceChange() вставляет в price_history:
   INSERT INTO price_history (number, old_price, new_price, ...)
   VALUES ('А123ВХ77', 240000, 250000, 10000, 'increased', ...)

5. insertOrUpdateListing() обновляет основную цену:
   UPDATE listings SET price = 250000 WHERE number = 'А123ВХ77'
```

---

### ➡️ Объявление БЕЗ изменений

```
1. Парсинг находит: В456DE99, цена 280000

2. getDifferentialListings() проверяет:
   "Есть ли В456DE99 в БД?"
   → Да! Старая цена: 280000

3. Цены совпадают:
   280000 = 280000

4. Ничего не делаем! Объявление игнорируется.
```

---

## API для доступа к данным

### Во время парсинга

```
GET /api/sessions/{sessionId}/status
→ Показывает прогресс, сколько уже спарсено
```

### После завершения

```
GET /api/sessions/{sessionId}/data
→ Только НОВЫЕ объявления + изменения цен

GET /api/price-changes?days=7
→ Все изменения цен за 7 дней

GET /api/price-history/{number}
→ История цен для одного объявления

GET /api/price-changes/stats?days=7
→ Статистика: сколько цен выросло/упало
```

---

## Производительность и оптимизация

### Количество запросов

**Обычный парсинг:**
```
5000 объявлений × 5000 INSERT/UPDATE = 5000 запросов в БД
```

**Дифференциальный парсинг:**
```
1 запрос: SELECT все номера (с индексом быстро!)
150 INSERT для новых
45 INSERT в price_history для изменений
= ~195 запросов вместо 5000! ✅
```

### Параллельность

**parser.js:**
```javascript
concurrentRequests: 500  // 500 параллельных запросов к сайту
requestDelayMs: 50       // 50ms задержка между волнами
```

**db.js / db-pg.js:**
```javascript
pool: { max: 10 }        // 10 параллельных соединений к БД
```

---

## Ошибки и восстановление

### Если сбой во время парсинга

```
1. Сессия сохранена в памяти
2. Если были батчи — можно вызвать:
   POST /api/sessions/{sessionId}/continue
3. Если неудача полная:
   DELETE /api/sessions/{sessionId}
```

### Если сбой при сохранении в БД

```javascript
try {
  await db.insertOrUpdateListing(data);
} catch (error) {
  console.error('Ошибка при вставке:', error);
  // Сессия все равно продолжает работу
  // Просто это объявление пропускается
}
```

---

## 🎯 Основные моменты

1️⃣ **Парсер** — получает данные с сайта
2️⃣ **Parser-DB Adapter** — управляет сессиями и сравнением
3️⃣ **БД слой** — хранит и сравнивает данные
4️⃣ **Таблицы** — listings (основные), price_history (изменения), parse_sessions (истории), cron_logs (автопарсинг)
5️⃣ **Сессии** — в памяти во время работы, в БД для истории

---

**Версия:** 1.0
**Дата:** 2025-01-20
