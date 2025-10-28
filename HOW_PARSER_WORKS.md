# 🔄 Как работает парсер с базой данных?

Полное объяснение архитектуры парсера и взаимодействия с БД.

---

## 📋 Содержание

1. [Архитектура](#архитектура)
2. [Жизненный цикл парсинга](#жизненный-цикл-парсинга)
3. [Сохранение данных](#сохранение-данных)
4. [Автоматические обновления](#автоматические-обновления)
5. [REST API](#rest-api)
6. [Примеры](#примеры)

---

## 🏗️ Архитектура

### Основные компоненты:

```
┌─────────────────────────────────────────────────────┐
│                  WEB КЛИЕНТ                         │
│         (Браузер, мобильное приложение)            │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              EXPRESS СЕРВЕР                         │
│           (server.js)                              │
├─────────────────────────────────────────────────────┤
│ ├─ /api/parse (запуск парсинга)                    │
│ ├─ /api/data (получение данных)                   │
│ ├─ /api/statistics (статистика)                   │
│ ├─ /api/export (экспорт CSV/JSON)                 │
│ └─ /api/db/status (статус БД)                     │
└────┬─────────────────┬──────────────────┬──────────┘
     │                 │                  │
     ▼                 ▼                  ▼
┌──────────┐    ┌──────────┐      ┌────────────┐
│ PARSER   │    │ ADAPTER  │      │ API ROUTES │
│(parser.  │    │(parser-  │      │(api-db-   │
│ js)      │    │db.js)    │      │routes.js) │
└────┬─────┘    └────┬─────┘      └────┬───────┘
     │               │                  │
     └───────────────┼──────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   БД МОДУЛЬ            │
        │ ├─ db.js (MySQL)       │
        │ └─ db-pg.js (Postgres) │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  PostgreSQL / MySQL    │
        │   (ТАБЛИЦЫ)            │
        │ ├─ listings            │
        │ ├─ parse_sessions      │
        │ └─ cron_logs           │
        └────────────────────────┘
```

---

## 🔄 Жизненный цикл парсинга

### Шаг 1: Пользователь запускает парсинг

**Способ A - через веб:**
```
Пользователь нажимает кнопку "Запустить парсинг"
              ↓
Браузер отправляет POST /api/parse
              ↓
express обрабатывает запрос
```

**Способ B - через API:**
```bash
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 50, "minPrice": 0}'
```

**Способ C - автоматически (cron):**
```
00:00 каждый день
      ↓
scheduler.js запускает парsingTask()
      ↓
Парсинг начинается автоматически
```

---

### Шаг 2: Инициализация парсера

**File: `server.js` → `POST /api/parse`**

```javascript
// 1. Создаются параметры парсинга
const parser = new AutonomeraParser({
  minPrice: 0,
  maxPrice: 500000,
  maxPages: 50,
  concurrentRequests: 500
});

// 2. Создается сессия
const sessionId = 'session_1234567890_abc123';
sessions.set(sessionId, {
  parser,
  status: 'running',
  startTime: Date.now()
});

// 3. Возвращается сессия клиенту
res.json({ sessionId, status: 'started' });

// 4. Парсинг запускается асинхронно (в фоне)
parser.parse().then(...)
```

---

### Шаг 3: Парсер собирает данные

**File: `parser.js`**

```javascript
async parse(resumeMode = false) {
  // 1. Инициализирует браузер (Puppeteer)
  await this.initBrowser();

  // 2. Открывает сайт autonomera777.net
  const page = await this.browser.newPage();
  await page.goto('https://autonomera777.net');

  // 3. Загружает объявления (параллельно)
  // - Скроллит страницу
  // - Нажимает "Показать еще"
  // - Собирает данные из HTML/JavaScript

  // 4. Парсит каждое объявление
  // Извлекает:
  // - number (номер А123ВХ77)
  // - price (цена)
  // - region (регион)
  // - datePosted (дата размещения)
  // - dateUpdated (дата обновления)
  // - seller (продавец)
  // - url (ссылка)

  // 5. Сохраняет в this.listings (памяти)
  this.listings.push({
    number: 'А123ВХ77',
    price: 250000,
    region: '77',
    status: 'active',
    datePosted: '2025-01-15 10:30',
    dateUpdated: '2025-01-20 15:45',
    seller: 'Иван Иванов',
    url: 'https://autonomera777.net/standart/12345',
    parsedAt: new Date().toISOString()
  });

  // 6. Закрывает браузер
  await this.closeBrowser();

  return { completed: true, count: this.listings.length };
}
```

**Результат:** Парсер собирает массив объявлений в памяти.

---

### Шаг 4: Адаптер преобразует данные для БД

**File: `parser-db.js`**

```javascript
async runParserWithDB(parser) {
  const adapter = new ParserDBAdapter(parser);

  try {
    // 1. Создает сессию в БД
    await adapter.startSession({
      minPrice: 0,
      maxPrice: 500000,
      maxPages: 50
    });
    // ↓
    // INSERT INTO parse_sessions (id, params, status)
    // VALUES ('session_123', '{"minPrice": 0, ...}', 'running')

    // 2. Запускает парсинг (как обычно)
    await parser.parse();
    // this.listings теперь содержит 500+ объявлений

    // 3. Сохраняет результаты в БД
    await adapter.saveListingsToDB();
    // ↓
    // FOR EACH listing:
    //   INSERT INTO listings (number, price, region, ...)
    //   ON CONFLICT (number) DO UPDATE SET ...

    // 4. Завершает сессию
    await adapter.completeSession();
    // ↓
    // UPDATE parse_sessions SET status='completed'

  } catch (error) {
    await adapter.completeSession(error);
  }
}
```

---

### Шаг 5: Сохранение в БД

**File: `db.js` или `db-pg.js`**

#### UPSERT логика:

```javascript
async insertOrUpdateListing(listingData) {
  // PostgreSQL версия:
  const query = `
    INSERT INTO listings (number, price, region, ...)
    VALUES ($1, $2, $3, ...)
    ON CONFLICT (number) DO UPDATE SET
      price = EXCLUDED.price,
      status = EXCLUDED.status,
      date_updated = EXCLUDED.date_updated,
      parsed_at = NOW()
  `;

  // MySQL версия:
  const query = `
    INSERT INTO listings (number, price, region, ...)
    VALUES (?, ?, ?, ...)
    ON DUPLICATE KEY UPDATE
      price = VALUES(price),
      status = VALUES(status),
      date_updated = VALUES(date_updated),
      parsed_at = NOW()
  `;

  // Результат:
  // Если номер уже есть → обновляет цену и дату
  // Если номера нет → вставляет новую запись
}
```

#### Пример:

```
Парсинг 1 (2025-01-20 10:00):
  INSERT А123ВХ77, 250000 → СОЗДАНА запись
  INSERT А234ХY88, 300000 → СОЗДАНА запись

Парсинг 2 (2025-01-21 10:00):
  UPDATE А123ВХ77, 240000 → цена упала, ОБНОВЛЕНА
  INSERT А345БЕ99, 350000 → новый номер, СОЗДАНА запись
```

---

### Шаг 6: Сессия логируется

**File: `parse_sessions` таблица**

```sql
INSERT INTO parse_sessions VALUES (
  id: 'session_1234567890',
  started_at: '2025-01-20 10:00:00',
  completed_at: '2025-01-20 10:45:00',
  status: 'completed',
  total_items: 2500,
  new_items: 150,
  updated_items: 50,
  params: {"maxPages": 50, "minPrice": 0},
  error: NULL
);
```

---

## 💾 Сохранение данных

### Три уровня хранения:

#### 1️⃣ Память (RAM)

```javascript
// Во время парсинга данные в памяти
parser.listings = [
  { number: 'А123ВХ77', price: 250000, ... },
  { number: 'А234ХY88', price: 300000, ... },
  // ... 500+ объявлений
];

// Если приложение упадет → данные потеряются
```

#### 2️⃣ База данных (Persistent)

```sql
-- Данные сохраняются в БД после парсинга
SELECT * FROM listings;
-- Сохранится навсегда (или пока не удалим)
-- Не потеряется при перезагрузке сервера
```

#### 3️⃣ Экспорт (CSV/JSON)

```bash
# Пользователь может скачать данные в файл
GET /api/export?format=csv
  ↓
  autonomera777.csv (200 KB)

GET /api/export?format=json
  ↓
  autonomera777.json (150 KB)
```

---

## 📅 Автоматические обновления

### Как работает cron:

**File: `scheduler.js`**

```javascript
// 1. При запуске сервера планировщик инициализируется
const scheduler = new ParsingScheduler();
await scheduler.initialize();

// 2. node-cron ждет время 00:00
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ 00:00 - начинаем парсинг!');

  // 3. Запускает парсинг
  await executeParsingTask();

  // 4. Параллельно с сервером работает парсинг
  // Сервер продолжает отвечать на запросы
  // Парсинг собирает данные в фоне

  // 5. Когда парсинг завершен, логируется
  await logCronExecution('completed');
});
```

### Сегодня - Завтра:

```
Пт 18:00 → Сервер запущен → Планировщик ждет
Сб 00:00 → Планировщик запускает парсинг
           ├─ Парсинг собирает данные (20 мин)
           ├─ Сохраняет в БД
           └─ Логирует результаты
Сб 00:20 → Парсинг завершен ✅
Сб 00:21 → Планировщик снова ждет завтра
Вс 00:00 → Парсинг снова... и так каждый день
```

---

## 🌐 REST API

### Как данные достигают пользователя:

```
Пользователь:
  curl /api/data
      ↓
  Express (server.js):
    app.get('/api/data', async (req, res) => {
      const listings = await db.getListings(filters);
      res.json({ data: listings });
    })
      ↓
  БД модуль (db-pg.js):
    async getListings(filters) {
      const result = await pool.query(
        'SELECT * FROM listings WHERE ...',
        params
      );
      return result.rows;
    }
      ↓
  PostgreSQL:
    SELECT * FROM listings
    WHERE price BETWEEN 100000 AND 500000
    LIMIT 100;
      ↓
  Результат: [
    { number: 'А123ВХ77', price: 250000, ... },
    { number: 'А234ХY88', price: 300000, ... },
    ...
  ]
      ↓
  Express отправляет JSON
      ↓
  Браузер получает и отображает
```

---

## 💡 Примеры

### Пример 1: Запуск парсинга вручную

```bash
# 1. Пользователь нажимает кнопку
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "minPrice": 100000,
    "maxPrice": 500000,
    "maxPages": 50
  }'

# 2. Сервер возвращает ID сессии
{
  "sessionId": "session_1234567890",
  "status": "started"
}

# 3. Парсер начинает работать (в фоне)
# - Открывает сайт
# - Собирает данные
# - Сохраняет в БД

# 4. Пользователь проверяет статус
curl http://localhost:3000/api/sessions/session_1234567890/status

# 5. Когда парсинг завершен:
{
  "status": "completed",
  "totalListings": 2500,
  "progress": 100
}

# 6. Пользователь получает данные
curl http://localhost:3000/api/data?minPrice=100000

# 7. Или экспортирует в CSV
curl http://localhost:3000/api/export?format=csv -o data.csv
```

---

### Пример 2: Автоматический парсинг (ночью)

```
22:00 - Пользователь спит, сервер работает
00:00 - Планировщик автоматически запускает парсинг
         ├─ Парсер открывает сайт
         ├─ Собирает 5000+ объявлений
         ├─ Сохраняет в PostgreSQL на Amvera
         └─ Логирует в cron_logs

07:00 - Пользователь просыпается
         ├─ Открывает /api/data
         └─ Видит все новые объявления!

         SELECT * FROM listings
         WHERE parsed_at > '2025-01-21 00:00'
         → Получает 5000 новых записей
```

---

### Пример 3: UPSERT в действии

```
День 1 - парсинг (10:00):
  А123ВХ77 - 250000 руб.
  А234ХY88 - 300000 руб.
  └─ Вставлены в БД (2 новые записи)

День 2 - парсинг (10:00):
  А123ВХ77 - 240000 руб. ← ЦЕНА УПАЛА!
  А234ХY88 - 300000 руб.
  А345БЕ99 - 350000 руб.
  └─ А123 обновлена (цена)
  └─ А234 не изменилась (skipped)
  └─ А345 вставлена (новая)

SELECT * FROM listings WHERE number = 'А123ВХ77';
→ Одна запись с price=240000 и updated_at='2025-01-21 10:00'
```

---

## 📊 Поток данных (полная схема)

```
autonomera777.net (веб-сайт)
    ↓ (Puppeteer открывает браузер)
HTML/JavaScript на странице
    ↓ (Cheerio парсит HTML)
Извлеченные данные (JSON)
    ↓ (ParserDBAdapter преобразует)
Данные готовые для БД
    ↓ (pool.query запускает INSERT/UPDATE)
PostgreSQL на Amvera
    ├─ listings таблица ← основные данные
    ├─ parse_sessions таблица ← история
    └─ cron_logs таблица ← логи

Пользователь запрашивает данные:
    curl /api/data
    ↓
    db.getListings()
    ↓
    SELECT * FROM listings
    ↓
    PostgreSQL возвращает результаты
    ↓
    Express формирует JSON
    ↓
    Браузер отображает таблицу
```

---

## 🔐 Безопасность данных

```
1. Во время парсинга:
   Данные только в памяти (безопасно, локально)

2. После парсинга:
   Данные сохраняются в PostgreSQL
   ├─ Зашифрованное соединение (SSL)
   ├─ Хранится на защищенном сервере (Amvera)
   └─ Доступно только авторизованному пользователю

3. При экспорте:
   Данные загружаются в файл (CSV/JSON)
   ├─ Все данные выгружаются
   └─ Пользователь скачивает локально

4. История:
   Все сессии логируются
   ├─ parse_sessions - кто запустил, когда, сколько
   └─ cron_logs - автоматические запуски
```

---

## ⚡ Производительность

### Скорость парсинга:

```
Параметры:
- maxPages: 50 (500 объявлений)
- concurrentRequests: 500 (параллельные запросы)
- requestDelay: 1000 мс

Примерное время:
- Загрузка данных: 5-10 минут
- Парсинг HTML: 2-5 минут
- Сохранение в БД: 1-2 минуты
- ─────────────────────────
- Итого: 10-20 минут

PostgreSQL на Amvera:
- Скорость вставки: 1000+ записей/сек
- Индексы: автоматически ускоряют поиск
- Память: не ограничена (облако)
```

---

## 🎯 Краткое резюме

| Этап | Компонент | Что происходит |
|------|-----------|--------|
| 1 | client → API | Пользователь нажимает "Парсить" |
| 2 | server.js | Создается сессия парсинга |
| 3 | parser.js | Парсер открывает браузер и собирает данные |
| 4 | this.listings | Данные временно хранятся в памяти |
| 5 | parser-db.js | Адаптер преобразует данные |
| 6 | db-pg.js | UPSERT логика подготавливает SQL |
| 7 | PostgreSQL | Данные сохраняются в таблице listings |
| 8 | parse_sessions | Логируется информация о сессии |
| 9 | API | Пользователь может получить данные через /api/data |
| 10 | cron | Завтра в 00:00 всё повторится автоматически |

---

## 🚀 Итог

Парсер работает в 3 режимах:

1. **Ручной запуск** → Пользователь нажимает кнопку → Парсинг в фоне
2. **Автоматический запуск** → Каждый день в 00:00 → Cron планировщик
3. **API запросы** → /api/data, /api/statistics → Данные из БД

Все данные сохраняются в PostgreSQL на Amvera и доступны 24/7 через REST API! ✨

---

**Версия:** 1.0
**Дата:** 2025-01-28
**Платформа:** Node.js + PostgreSQL на Amvera
