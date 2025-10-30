# 🤖 Умный ежедневный парсинг с историей изменений

Новая архитектура парсера **Autonomera777** — это полностью автоматизированная система сбора и анализа данных с умным сравнением и историей изменений.

## 📋 Содержание

1. [Архитектура](#архитектура)
2. [Как это работает](#как-это-работает)
3. [Конфигурация для Amvera](#конфигурация-для-amvera)
4. [API эндпоинты](#api-эндпоинты)
5. [Примеры использования](#примеры-использования)

---

## 🏗️ Архитектура

### Общий поток данных

```
┌──────────────────────────────────────────────────────────────┐
│                      Браузер (localhost:3000)                │
│                                                              │
│  Пользователь нажимает "📥 Загрузить из БД"                │
└────────────────────────┬─────────────────────────────────────┘
                         │
                  GET /api/db/overview
                  GET /api/db/data
                  GET /api/db/regions
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    Express.js Сервер                        │
│                    (server.js:3000)                          │
│                                                              │
│  • Обработка запросов от браузера                          │
│  • Cron-планировщик (00:01 каждый день)                    │
│  • API для загрузки из БД                                   │
└────────────────┬───────────────────────────┬────────────────┘
                 │                           │
        ┌────────▼──────┐          ┌─────────▼─────────┐
        │ CRON Запуск    │          │ Загрузка из БД    │
        │ (00:01)        │          │ (по клику)        │
        └────────┬───────┘          │                   │
                 │                  └───────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │   AutonomeraParser         │
    │   (parser.js)              │
    │                            │
    │ • Инициализация браузера   │
    │ • Парсинг сайта           │
    │ • Экстракция данных       │
    │ • Обработка пагинации     │
    └────────────┬───────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │  smartUpsertListing()      │
    │                            │
    │ Логика:                    │
    │ 1. Получить старую запись  │
    │ 2. Вставить/обновить       │
    │ 3. Сравнить даты           │
    │ 4. Если дата выросла:      │
    │    - Проверить цену        │
    │    - Записать в историю    │
    └────────────┬───────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│                     PostgreSQL БД (Amvera)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ listings (основные данные)                           │  │
│  ├─ id, number, price, region, status                  │  │
│  ├─ date_posted, date_updated, seller, url            │  │
│  ├─ parsed_at, updated_at                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ listing_history (история изменений)                  │  │
│  ├─ id, number (ссылка на listings)                   │  │
│  ├─ old_price, new_price, price_delta                 │  │
│  ├─ change_direction (increased/decreased/unchanged)   │  │
│  ├─ date_updated_site, is_price_changed               │  │
│  ├─ recorded_at (когда записано в историю)            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ parse_sessions (логирование сессий)                 │  │
│  ├─ id, started_at, completed_at, status              │  │
│  ├─ total_items, new_items, updated_items             │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔄 Как это работает

### Сценарий 1: Ежедневный автоматический парсинг (Cron)

**Время:** Ежедневно в 00:01 (московское время)

```javascript
1. runCronParsing() запускается
   │
   ├─ Создаёт сессию парсинга в БД
   │
   ├─ Инициализирует AutonomeraParser с параметрами из .env
   │
   ├─ Парсит сайт → получает массив объявлений
   │  └─ 50-100 страниц (настраивается в .env)
   │
   ├─ Для каждого объявления:
   │  │
   │  └─ smartUpsertListing(listing, sessionId)
   │     │
   │     ├─ Получить старую запись по номеру
   │     │
   │     ├─ INSERT OR UPDATE в listings
   │     │
   │     ├─ Проверить: дата обновления выросла?
   │     │  └─ ЕСЛИ НЕТ → просто обновляем last_seen
   │     │  └─ ЕСЛИ ДА → идём дальше
   │     │
   │     ├─ Проверить: цена изменилась?
   │     │  ├─ ЕСЛИ НЕТ → записать в историю (только дата)
   │     │  └─ ЕСЛИ ДА → записать в историю (дата + дельта)
   │     │
   │     └─ Вернуть статус (new/updated/unchanged)
   │
   └─ Обновить итоги в parse_sessions
      ├─ total_items: 5000
      ├─ new_items: 120
      ├─ updated_items: 850
      └─ status: 'completed'
```

### Сценарий 2: Загрузка данных из БД (Пользователь)

**Действие:** Пользователь нажимает кнопку "📥 Загрузить из БД"

```javascript
1. startParsing() → вместо парсинга вызывает:
   │
   ├─ GET /api/db/overview
   │  └─ SELECT COUNT(*), AVG(price), MIN(price), MAX(price), ...
   │     Возвращает: { total, avgPrice, minPrice, maxPrice, ... }
   │
   ├─ GET /api/db/data?limit=10000
   │  └─ SELECT l.*, last_change FROM listings l
   │     LEFT JOIN (SELECT ... FROM listing_history) AS last_change
   │     Возвращает: массив объявлений с последним изменением цены
   │
   └─ GET /api/db/regions
      └─ SELECT region, COUNT(*), AVG(price), MIN(price), MAX(price)
         Возвращает: группировка по регионам

2. Браузер отображает:
   ├─ 📊 Обзор: статистика
   ├─ 📋 Данные: таблица с историей изменений
   ├─ 🌍 По регионам: аналитика
   └─ 📥 Кнопка экспорта в XLSX
```

### Логика smartUpsertListing (детально)

Функция находится в `db-pg.js:561`

```javascript
async function smartUpsertListing(listingData, sessionId) {
  // Входные данные от парсера:
  // {
  //   number: "A123BC45",           // номер
  //   price: 150000,                 // текущая цена
  //   region: "77",                  // регион
  //   status: "active",              // статус
  //   dateUpdated: "2025-10-30",     // дата обновления НА САЙТЕ
  //   datePosted: "2025-10-20",      // дата размещения
  //   seller: "Иван",                // продавец
  //   url: "https://..."             // URL
  // }

  // ШАГ 1: Получить текущую запись
  const existing = SELECT price, date_updated FROM listings WHERE number = ?

  // ШАГ 2: Вставить/обновить в listings
  INSERT INTO listings (...) VALUES (...)
  ON CONFLICT (number) DO UPDATE SET
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    date_updated = EXCLUDED.date_updated,
    parsed_at = NOW()

  // ШАГ 3: Проверка даты
  const newDateUpdated = new Date("2025-10-30")      // дата с сайта
  const oldDateUpdated = new Date("2025-10-28")      // из БД

  if (newDateUpdated <= oldDateUpdated) {
    // Дата НЕ выросла → выходим
    return { newEntry: false, reason: 'date_not_increased' }
  }

  // ШАГ 4: Проверка цены
  const prevPrice = 145000                            // старая цена из БД
  const newPrice = 150000                             // новая цена от парсера

  if (prevPrice === newPrice) {
    // Цена НЕ изменилась → записываем только дату
    INSERT INTO listing_history(
      number, price_delta=NULL, date_updated_site, is_price_changed=FALSE
    )
    return { priceChanged: false, historyRecorded: true }
  } else {
    // Цена ИЗМЕНИЛАСЬ → записываем дату и дельту
    const priceDelta = 150000 - 145000 = 5000
    INSERT INTO listing_history(
      number, new_price, price_delta=5000,
      change_direction='increased', date_updated_site, is_price_changed=TRUE
    )
    return { priceChanged: true, priceDelta: 5000, historyRecorded: true }
  }
}
```

---

## ⚙️ Конфигурация для Amvera

### 1. Переменные окружения (.env на Amvera)

```env
# === DATABASE (обязательно!) ===
DATABASE_URL=postgresql://user:password@amvera-host:port/database
DB_SSL=true

# === SERVER ===
PORT=3000
NODE_ENV=production

# === PARSER CONFIGURATION ===
MIN_PRICE=0
MAX_PRICE=10000000
MAX_PAGES=100
PARSER_REGION=

# === CRON CONFIGURATION ===
CRON_ENABLED=true
CRON_TIME=1 0 * * *              # 00:01 каждый день
PARSER_TIMEZONE=Europe/Moscow     # Таймзона для cron

# === REQUEST DELAYS (respectful scraping) ===
REQUEST_DELAY=400                 # 400ms между запросами
REQUEST_DELAY_MS=50               # 50ms между параллельными
REQUEST_TIMEOUT=15000             # 15 сек таймаут
CONCURRENT_REQUESTS=4             # Для облака немного ниже

# === PUPPETEER ===
PUPPETEER_HEADLESS=true
PUPPETEER_NO_SANDBOX=true
```

### 2. Как развернуть на Amvera

**Шаг 1:** Копировать репозиторий

```bash
git clone https://github.com/Aleksey341/Parser_Autonomera.git
cd Parser_Autonomera
```

**Шаг 2:** Создать файл `Procfile` (если его нет)

```
web: node server.js
```

**Шаг 3:** Связать с БД Amvera

- В Amvera интерфейсе: Services → PostgreSQL
- Скопировать `DATABASE_URL`
- Установить переменные окружения в Settings

**Шаг 4:** Развернуть

```bash
git push # Автоматический деплой на Amvera
```

**Шаг 5:** Проверить логи

```bash
amvera logs # В интерфейсе Amvera
```

---

## 📡 API эндпоинты

### Новые эндпоинты (для загрузки из БД)

#### GET `/api/db/overview`

Получить статистику из БД

```bash
curl http://localhost:3000/api/db/overview
```

**Ответ:**
```json
{
  "total": 5432,
  "regionsCount": 87,
  "sellersCount": 234,
  "avgPrice": 125000,
  "minPrice": 10000,
  "maxPrice": 999999,
  "lastUpdate": "2025-10-30"
}
```

---

#### GET `/api/db/data`

Получить данные с историей изменений

```bash
curl "http://localhost:3000/api/db/data?limit=1000&region=77&minPrice=50000&maxPrice=500000"
```

**Параметры:**
- `limit` (по умолчанию 1000, макс 10000)
- `offset` (для пагинации)
- `region` (фильтр по региону)
- `minPrice` (минимальная цена)
- `maxPrice` (максимальная цена)
- `status` (активно/снято)

**Ответ:**
```json
{
  "count": 100,
  "limit": 1000,
  "offset": 0,
  "rows": [
    {
      "id": 1,
      "number": "A123BC45",
      "price": 150000,
      "region": "77",
      "status": "active",
      "date_updated": "2025-10-30T10:00:00",
      "seller": "Иван",
      "url": "https://...",
      "last_change": {
        "price_delta": 5000,
        "date_updated_site": "2025-10-30",
        "recorded_at": "2025-10-30T10:05:00",
        "is_price_changed": true
      }
    },
    ...
  ]
}
```

---

#### GET `/api/db/regions`

Группировка по регионам

```bash
curl http://localhost:3000/api/db/regions
```

**Ответ:**
```json
{
  "rows": [
    {
      "region": "77",
      "total": 1234,
      "avg_price": 125000,
      "min_price": 10000,
      "max_price": 999999
    },
    {
      "region": "78",
      "total": 890,
      "avg_price": 115000,
      "min_price": 15000,
      "max_price": 850000
    }
  ]
}
```

---

#### GET `/api/db/sellers`

Группировка по продавцам

```bash
curl http://localhost:3000/api/db/sellers
```

---

#### GET `/api/db/price-changes`

История изменений цен за N дней

```bash
curl "http://localhost:3000/api/db/price-changes?days=7&limit=100"
```

**Ответ:**
```json
{
  "days": 7,
  "count": 45,
  "rows": [
    {
      "number": "A123BC45",
      "old_price": 145000,
      "new_price": 150000,
      "price_delta": 5000,
      "change_direction": "increased",
      "date_updated_site": "2025-10-30",
      "recorded_at": "2025-10-30T10:05:00"
    }
  ]
}
```

---

#### GET `/api/db/export`

Экспортировать все данные в XLSX

```bash
curl http://localhost:3000/api/db/export > export.xlsx
```

**Скачивает файл Excel** с колонками:
- Номер
- Цена
- Регион
- Статус
- Продавец
- Дата обновления
- Изм. цены
- Дата изм. цены
- URL

---

## 💡 Примеры использования

### Пример 1: Получить все объявления региона 77 дороже 100k

```javascript
const data = await fetch('http://localhost:3000/api/db/data', {
  method: 'GET',
  url: '/api/db/data?region=77&minPrice=100000'
});
const result = await data.json();
console.log(`Найдено ${result.count} объявлений`);
```

### Пример 2: Получить объявления, цена которых выросла

```javascript
const changes = await fetch('http://localhost:3000/api/db/price-changes?days=1');
const result = await changes.json();
const increased = result.rows.filter(r => r.change_direction === 'increased');
console.log(`Цена выросла у ${increased.length} объявлений`);
```

### Пример 3: Анализ по регионам

```javascript
const regions = await fetch('http://localhost:3000/api/db/regions');
const result = await regions.json();
const top3 = result.rows.slice(0, 3);
top3.forEach(r => {
  console.log(`Регион ${r.region}: ${r.total} объявлений, средняя цена ${r.avg_price}`);
});
```

---

## 📊 Таблицы БД

### listings

```sql
CREATE TABLE listings (
  id SERIAL PRIMARY KEY,
  number VARCHAR(15) UNIQUE NOT NULL,
  price INTEGER,
  region VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  date_posted TIMESTAMP,
  date_updated TIMESTAMP,              -- дата обновления на сайте
  seller VARCHAR(255),
  url VARCHAR(500) UNIQUE,
  parsed_at TIMESTAMP DEFAULT NOW(),   -- когда спарсили
  updated_at TIMESTAMP DEFAULT NOW()   -- когда обновили в БД
);
```

### listing_history

```sql
CREATE TABLE listing_history (
  id SERIAL PRIMARY KEY,
  number VARCHAR(15) NOT NULL REFERENCES listings(number),
  old_price INTEGER,
  new_price INTEGER,
  price_delta INTEGER,                 -- разница между ценами
  change_direction VARCHAR(20),        -- 'increased'/'decreased'/'unchanged'
  date_updated_site TIMESTAMP,         -- дата "обновлено" с сайта
  is_price_changed BOOLEAN DEFAULT FALSE,
  recorded_at TIMESTAMP DEFAULT NOW(),
  session_id VARCHAR(36)
);
```

### parse_sessions

```sql
CREATE TABLE parse_sessions (
  id VARCHAR(36) PRIMARY KEY,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP NULL,
  status VARCHAR(50),                  -- 'running'/'completed'/'error'
  total_items INTEGER,
  new_items INTEGER,
  updated_items INTEGER,
  params JSONB,
  error TEXT
);
```

---

## 🔍 Отладка и логирование

### Просмотр логов cron-запуска

На сервере:
```bash
tail -f server.log | grep "CRON"
```

Вывод:
```
🤖 CRON-ПАРСИНГ ЗАПУЩЕН: 2025-10-30T00:01:00.000Z
📌 Сессия: session_1730239260000_abc123
📊 Параметры: цена 0-10000000, регион: null, страниц: 100
✅ Парсинг завершен: 5432 объявлений
📈 Результаты сохранения:
   - Новых: 120
   - Обновлено: 850
   - Без изменений: 4462
✅ Cron-парсинг успешно завершен
```

### Проверить включен ли cron

```bash
curl http://localhost:3000/api/health
```

Если cron работает, в логах сервера должно быть:
```
⏰ CRON ПАРСИНГ ВКЛЮЧЕН
   Расписание: 1 0 * * *
   Таймзона: Europe/Moscow
✅ Cron-парсинг инициализирован
```

---

## ✅ Чек-лист развертывания на Amvera

- [ ] Создать PostgreSQL БД в Amvera
- [ ] Скопировать `DATABASE_URL`
- [ ] Создать переменные окружения:
  - [ ] `CRON_ENABLED=true`
  - [ ] `CRON_TIME=1 0 * * *`
  - [ ] `PARSER_TIMEZONE=Europe/Moscow`
  - [ ] `MAX_PAGES=100`
  - [ ] `REQUEST_DELAY=400`
- [ ] Пушить код на Amvera (автодеплой)
- [ ] Проверить логи: `amvera logs`
- [ ] Открыть приложение и нажать "📥 Загрузить из БД"
- [ ] Проверить данные в таблице
- [ ] Дождаться 00:01 следующего дня (или тестировать cron локально)

---

## 📞 Помощь и troubleshooting

### Проблема: Cron не запускается

**Решение:**
```env
CRON_ENABLED=true           # Включить
CRON_TIME=1 0 * * *         # Правильный формат
PARSER_TIMEZONE=Europe/Moscow # Правильная таймзона
```

### Проблема: БД недоступна в cron

**Решение:** Проверить `DATABASE_URL` и `DB_SSL`

### Проблема: Браузер не загружает данные

**Решение:** Проверить CORS в `server.js` (должен быть включен)

---

## 📚 Дополнительные документы

- [ARCHITECTURE.md](./ARCHITECTURE.md) — общая архитектура проекта
- [API_REFERENCE.md](./API_REFERENCE.md) — полный API
- [DATABASE_SETUP.md](./DATABASE_SETUP.md) — настройка БД
- [POSTGRESQL_MIGRATION.md](./POSTGRESQL_MIGRATION.md) — миграция на PostgreSQL

---

Создано: октябрь 2025
Версия: 2.1.0
Архитектура: Smart Daily Parsing with History Tracking
