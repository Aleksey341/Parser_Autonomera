# 🔍 SQL Запросы парсера

Все SQL запросы, которые выполняет парсер при работе с БД.

---

## 📋 Содержание

1. [Инициализация БД](#инициализация-бд)
2. [Дифференциальное сравнение](#дифференциальное-сравнение)
3. [Сохранение данных](#сохранение-данных)
4. [Получение данных](#получение-данных)
5. [Статистика](#статистика)
6. [Управление сессиями](#управление-сессиями)

---

## Инициализация БД

### Создание таблиц (выполняется один раз)

#### PostgreSQL (db-pg.js)

```sql
-- 1. Основная таблица объявлений
CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  number VARCHAR(15) UNIQUE NOT NULL,
  price INTEGER,
  region VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  date_posted TIMESTAMP,
  date_updated TIMESTAMP,
  seller VARCHAR(255),
  url VARCHAR(500) UNIQUE,
  parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listings_region ON listings(region);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_updated_at ON listings(updated_at);
CREATE INDEX IF NOT EXISTS idx_listings_parsed_at ON listings(parsed_at);

-- 2. Таблица историй парсинга (сессии)
CREATE TABLE IF NOT EXISTS parse_sessions (
  id VARCHAR(36) PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  status VARCHAR(50) DEFAULT 'running',
  total_items INTEGER DEFAULT 0,
  new_items INTEGER DEFAULT 0,
  updated_items INTEGER DEFAULT 0,
  params JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON parse_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON parse_sessions(started_at);

-- 3. Таблица истории цен
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  number VARCHAR(15) NOT NULL,
  old_price INTEGER,
  new_price INTEGER,
  price_delta INTEGER,
  change_direction VARCHAR(20),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id VARCHAR(36),
  FOREIGN KEY (session_id) REFERENCES parse_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_history_number ON price_history(number);
CREATE INDEX IF NOT EXISTS idx_price_history_updated_at ON price_history(updated_at);
CREATE INDEX IF NOT EXISTS idx_price_history_session ON price_history(session_id);

-- 4. Таблица логов автопарсинга (cron)
CREATE TABLE IF NOT EXISTS cron_logs (
  id SERIAL PRIMARY KEY,
  scheduled_time TIMESTAMP,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  status VARCHAR(50) DEFAULT 'running',
  items_processed INTEGER DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_started_at ON cron_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_cron_status ON cron_logs(status);
```

#### MySQL (db.js)

```sql
-- 1. Основная таблица объявлений
CREATE TABLE IF NOT EXISTS listings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(15) UNIQUE NOT NULL,
  price INT,
  region VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  datePosted TIMESTAMP NULL,
  dateUpdated TIMESTAMP NULL,
  seller VARCHAR(255),
  url VARCHAR(500) UNIQUE,
  parsedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_listings_region ON listings(region);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_updatedAt ON listings(updatedAt);
CREATE INDEX idx_listings_parsedAt ON listings(parsedAt);

-- 2. Таблица историй парсинга
CREATE TABLE IF NOT EXISTS parse_sessions (
  id VARCHAR(36) PRIMARY KEY,
  startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP NULL,
  status VARCHAR(50) DEFAULT 'running',
  totalItems INT DEFAULT 0,
  newItems INT DEFAULT 0,
  updatedItems INT DEFAULT 0,
  params JSON,
  error TEXT
);

CREATE INDEX idx_sessions_status ON parse_sessions(status);
CREATE INDEX idx_sessions_startedAt ON parse_sessions(startedAt);

-- 3. Таблица истории цен
CREATE TABLE IF NOT EXISTS price_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(15) NOT NULL,
  old_price INT,
  new_price INT,
  price_delta INT,
  change_direction VARCHAR(20),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id VARCHAR(36),
  FOREIGN KEY (session_id) REFERENCES parse_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_price_history_number ON price_history(number);
CREATE INDEX idx_price_history_updated_at ON price_history(updated_at);
CREATE INDEX idx_price_history_session ON price_history(session_id);

-- 4. Таблица логов автопарсинга
CREATE TABLE IF NOT EXISTS cron_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scheduledTime TIMESTAMP NULL,
  startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP NULL,
  status VARCHAR(50) DEFAULT 'running',
  itemsProcessed INT DEFAULT 0,
  error TEXT
);

CREATE INDEX idx_cron_startedAt ON cron_logs(startedAt);
CREATE INDEX idx_cron_status ON cron_logs(status);
```

---

## Дифференциальное сравнение

### 1. Получить все существующие номера

Это первый и самый важный запрос при дифференциальном парсинге!

**PostgreSQL:**
```sql
SELECT number, price FROM listings WHERE status = 'active';
```

**MySQL:**
```sql
SELECT number, price FROM listings WHERE status = 'active';
```

**Результат:** Объект с числом объявлений в памяти парсера
```javascript
{
  'А123ВХ77': 250000,
  'В456DE99': 280000,
  'З789МХ99': 180000,
  // ... 5000+ номеров
}
```

**Время выполнения:** ~100ms при индексе на number

---

### 2. Запись изменения цены

Выполняется для КАЖДОГО объявления, у которого цена изменилась.

**PostgreSQL:**
```sql
INSERT INTO price_history (number, old_price, new_price, price_delta, change_direction, session_id)
VALUES ($1, $2, $3, $4, $5, $6);
```

**MySQL:**
```sql
INSERT INTO price_history (number, old_price, new_price, price_delta, change_direction, session_id)
VALUES (?, ?, ?, ?, ?, ?);
```

**Параметры:**
- number: 'А123ВХ77'
- old_price: 240000
- new_price: 250000
- price_delta: 10000
- change_direction: 'increased'
- session_id: 'session_1735404000000_abc123def'

**Время:** ~10ms за запрос (всего 45 запросов при 45 изменениях)

---

## Сохранение данных

### 1. Insert или Update (UPSERT)

Выполняется для КАЖДОГО нового объявления.

**PostgreSQL (ON CONFLICT):**
```sql
INSERT INTO listings (number, price, region, status, date_posted, date_updated, seller, url, parsed_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
ON CONFLICT (number) DO UPDATE SET
  price = EXCLUDED.price,
  status = EXCLUDED.status,
  date_updated = EXCLUDED.date_updated,
  parsed_at = NOW();
```

**MySQL (ON DUPLICATE KEY UPDATE):**
```sql
INSERT INTO listings (number, price, region, status, datePosted, dateUpdated, seller, url, parsedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
ON DUPLICATE KEY UPDATE
  price = VALUES(price),
  status = VALUES(status),
  dateUpdated = NOW(),
  parsedAt = NOW();
```

**Параметры:**
- number: 'З789МХ99' (UNIQUE, поэтому если существует — обновляем)
- price: 180000
- region: 'Казань'
- status: 'active'
- date_posted: '2025-01-20 10:30:00'
- date_updated: '2025-01-20 15:45:00'
- seller: 'John Doe'
- url: 'https://autonomera777.net/...'

**Что происходит:**
- Если номера нет → INSERT (вставка)
- Если номер существует → UPDATE (обновление)

**Время:** ~15ms за запрос (всего 150 запросов при 150 новых объявлениях)

---

## Получение данных

### 1. Получить все объявления с фильтрацией

```sql
-- PostgreSQL
SELECT * FROM listings
WHERE status = $1
  AND price >= $2
  AND price <= $3
  AND region = $4
ORDER BY updated_at DESC
LIMIT $5;

-- MySQL
SELECT * FROM listings
WHERE status = ?
  AND price >= ?
  AND price <= ?
  AND region = ?
ORDER BY updatedAt DESC
LIMIT ?;
```

**Параметры:**
- status: 'active'
- minPrice: 100000
- maxPrice: 500000
- region: 'Москва'
- limit: 10000

**Результат:**
```javascript
[
  {
    id: 1,
    number: 'А123ВХ77',
    price: 250000,
    region: 'Москва',
    status: 'active',
    seller: 'John Doe',
    url: '...',
    parsed_at: '2025-01-20 15:45:00'
  },
  // ... остальные
]
```

---

### 2. История цен для номера

```sql
-- PostgreSQL
SELECT * FROM price_history
WHERE number = $1
ORDER BY updated_at DESC
LIMIT $2;

-- MySQL
SELECT * FROM price_history
WHERE number = ?
ORDER BY updated_at DESC
LIMIT ?;
```

**Параметры:**
- number: 'А123ВХ77'
- limit: 10

**Результат:**
```
id  | number    | old_price | new_price | price_delta | change_direction | updated_at
----|-----------|-----------|-----------|-------------|------------------|--------------------
1   | А123ВХ77  | 240000    | 250000    | 10000       | increased        | 2025-01-20 15:45
2   | А123ВХ77  | 230000    | 240000    | 10000       | increased        | 2025-01-19 15:45
3   | А123ВХ77  | 200000    | 230000    | 30000       | increased        | 2025-01-18 15:45
```

---

### 3. Все изменения за период

```sql
-- PostgreSQL
SELECT * FROM price_history
WHERE updated_at >= NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC
LIMIT $1;

-- MySQL
SELECT * FROM price_history
WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY updated_at DESC
LIMIT ?;
```

**Параметры:**
- days: 7
- limit: 1000

**Результат:** Все 1000 (или менее) изменений цен за последние 7 дней

---

## Статистика

### 1. Общая статистика по объявлениям

```sql
-- PostgreSQL
SELECT
  COUNT(*) as total,
  COUNT(DISTINCT region) as regions_count,
  COUNT(DISTINCT seller) as sellers_count,
  ROUND(AVG(price)::numeric) as avg_price,
  MIN(price) as min_price,
  MAX(price) as max_price,
  DATE(MAX(updated_at)) as last_update
FROM listings
WHERE status = 'active';

-- MySQL
SELECT
  COUNT(*) as total,
  COUNT(DISTINCT region) as regions_count,
  COUNT(DISTINCT seller) as sellers_count,
  ROUND(AVG(price)) as avg_price,
  MIN(price) as min_price,
  MAX(price) as max_price,
  DATE(MAX(updatedAt)) as last_update
FROM listings
WHERE status = 'active';
```

**Результат:**
```
total | regions | sellers | avg_price | min_price | max_price | last_update
------|---------|---------|-----------|-----------|-----------|-------------
5230  | 45      | 1250    | 250000    | 50000     | 950000    | 2025-01-20
```

---

### 2. Статистика по изменениям цен

```sql
-- PostgreSQL
SELECT
  COUNT(*) as total_changes,
  COUNT(CASE WHEN change_direction = 'increased' THEN 1 END) as increased,
  COUNT(CASE WHEN change_direction = 'decreased' THEN 1 END) as decreased,
  COUNT(CASE WHEN change_direction = 'unchanged' THEN 1 END) as unchanged,
  ROUND(AVG(price_delta)::numeric, 2) as avg_delta,
  MIN(price_delta) as min_delta,
  MAX(price_delta) as max_delta
FROM price_history
WHERE updated_at >= NOW() - INTERVAL '7 days';

-- MySQL
SELECT
  COUNT(*) as total_changes,
  SUM(CASE WHEN change_direction = 'increased' THEN 1 ELSE 0 END) as increased,
  SUM(CASE WHEN change_direction = 'decreased' THEN 1 ELSE 0 END) as decreased,
  SUM(CASE WHEN change_direction = 'unchanged' THEN 1 ELSE 0 END) as unchanged,
  ROUND(AVG(price_delta), 2) as avg_delta,
  MIN(price_delta) as min_delta,
  MAX(price_delta) as max_delta
FROM price_history
WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);
```

**Результат:**
```
total | increased | decreased | unchanged | avg_delta | min_delta | max_delta
------|-----------|-----------|-----------|-----------|-----------|----------
285   | 180       | 105       | 0         | 5250      | -50000    | 80000
```

---

## Управление сессиями

### 1. Создать новую сессию

```sql
-- PostgreSQL
INSERT INTO parse_sessions (id, params, status)
VALUES ($1, $2, 'running');

-- MySQL
INSERT INTO parse_sessions (id, params, status)
VALUES (?, ?, 'running');
```

**Параметры:**
- id: 'session_1735404000000_abc123def'
- params: '{"maxPages": 50, "region": null, "isDifferential": true}'

---

### 2. Обновить статус сессии

```sql
-- PostgreSQL (динамическое обновление полей)
UPDATE parse_sessions SET
  status = $1,
  total_items = $2,
  new_items = $3,
  updated_items = $4,
  completed_at = NOW()
WHERE id = $5;

-- MySQL
UPDATE parse_sessions SET
  status = ?,
  total_items = ?,
  new_items = ?,
  updated_items = ?,
  completed_at = NOW()
WHERE id = ?;
```

**Параметры:**
- status: 'completed'
- total_items: 5000
- new_items: 150
- updated_items: 45
- id: 'session_1735404000000_abc123def'

---

### 3. Получить историю парсинга

```sql
-- PostgreSQL
SELECT * FROM parse_sessions
WHERE status = $1
ORDER BY started_at DESC
LIMIT $2;

-- MySQL
SELECT * FROM parse_sessions
WHERE status = ?
ORDER BY startedAt DESC
LIMIT ?;
```

**Параметры:**
- status: 'completed'
- limit: 10

**Результат:** Последние 10 завершенных парсингов

---

## Примеры реальных запросов

### Сценарий 1: Дифференциальный парсинг 5000 объявлений

```
Шаг 1: SELECT number, price FROM listings WHERE status = 'active'
       → 5230 номеров загружено в память за 100ms

Шаг 2: Парсер парсит сайт
       → Получает 5000 объявлений за 45 секунд

Шаг 3: Сравнение в памяти (в коде JavaScript)
       → 150 новых
       → 45 с изменением цены
       → 4805 без изменений

Шаг 4: INSERT для новых
       INSERT INTO listings ... ×150 запросов
       → 150 × 15ms = 2.25 секунды

Шаг 5: INSERT в price_history для изменений
       INSERT INTO price_history ... ×45 запросов
       → 45 × 10ms = 0.45 секунды

Шаг 6: UPDATE parse_sessions
       UPDATE parse_sessions SET ... (1 запрос)
       → 10ms

ИТОГО: 45 + 2.25 + 0.45 + 0.01 = 47.71 секунды
```

---

### Сценарий 2: Получение результатов

```
1. GET /api/sessions/{id}/data

   → SELECT * FROM listings WHERE ... (для вывода 150 новых)
   → SELECT * FROM price_history WHERE session_id = ? (45 запросов)

2. GET /api/price-changes?days=7

   → SELECT * FROM price_history WHERE updated_at >= ... (1 запрос)
   → Возвращает 285 изменений

3. GET /api/price-history/А123ВХ77

   → SELECT * FROM price_history WHERE number = ? (1 запрос)
   → Возвращает 10 последних изменений
```

---

## Оптимизация запросов

### Индексы (очень важно!)

```
listings:
  ✅ UNIQUE INDEX на number (самый быстрый поиск)
  ✅ INDEX на region (поиск по региону)
  ✅ INDEX на status (фильтрация active/inactive)
  ✅ INDEX на price (поиск по цене)
  ✅ INDEX на updated_at (сортировка)

price_history:
  ✅ INDEX на number (история для номера)
  ✅ INDEX на updated_at (поиск по дате)
  ✅ INDEX на session_id (связь с сессией)

parse_sessions:
  ✅ PRIMARY KEY на id (уникальный)
  ✅ INDEX на status (поиск running/completed)
  ✅ INDEX на started_at (сортировка по времени)
```

### Результаты:

| Запрос | Без индекса | С индексом |
|--------|-----------|-----------|
| SELECT number FROM listings (5230 записей) | 500ms | 50ms |
| SELECT * FROM price_history WHERE number = ? | 200ms | 15ms |
| SELECT * FROM listings ORDER BY updated_at | 800ms | 100ms |

---

## Ошибки и восстановление

### Если запрос fail'ит

```javascript
try {
  await db.insertOrUpdateListing(data);
} catch (error) {
  // Логируем ошибку
  console.error('Ошибка при вставке:', error);

  // Продолжаем работу
  // Это объявление пропускается
  // Остальные продолжают вставляться
}
```

### Если БД недоступна

```
1. Сессия остается в памяти (server.js)
2. Парсинг прерывается, но данные не теряются
3. Пользователь получает ошибку
4. Сессия остается доступной для возобновления
```

---

**Версия:** 1.0
**Дата:** 2025-01-20
