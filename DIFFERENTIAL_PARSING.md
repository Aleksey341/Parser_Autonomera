# 🔄 Дифференциальный парсинг и отслеживание цен

Полное руководство по новой функции дифференциального парсинга с отслеживанием изменений цен.

---

## 📋 Содержание

1. [Что такое дифференциальный парсинг?](#что-такое-дифференциальный-парсинг)
2. [Новые таблицы БД](#новые-таблицы-бд)
3. [API Endpoints](#api-endpoints)
4. [Примеры использования](#примеры-использования)
5. [Архитектура](#архитектура)

---

## Что такое дифференциальный парсинг?

**Дифференциальный парсинг** — это метод парсинга, при котором система:

1. **Сравнивает** спарсенные данные с существующими данными в БД
2. **Идентифицирует** только новые объявления (которые раньше не было)
3. **Отслеживает** изменения цен для существующих номеров
4. **Возвращает** только измененные/новые данные пользователю

### Преимущества:

✅ **Экономия трафика** — не повторяются ненужные данные
✅ **Анализ цен** — отслеживаются все изменения цен
✅ **История** — полная история цен для каждого номера
✅ **Статистика** — статистика по росту/снижению цен

---

## Новые таблицы БД

### price_history

Новая таблица для отслеживания истории изменений цен:

```sql
CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  number VARCHAR(15) NOT NULL,                -- номер объявления
  old_price INTEGER,                          -- старая цена
  new_price INTEGER,                          -- новая цена
  price_delta INTEGER,                        -- изменение (new - old)
  change_direction VARCHAR(20),               -- 'increased', 'decreased', 'unchanged'
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id VARCHAR(36),                     -- ID парсинга
  FOREIGN KEY (session_id) REFERENCES parse_sessions(id)
);

CREATE INDEX idx_price_history_number ON price_history(number);
CREATE INDEX idx_price_history_updated_at ON price_history(updated_at);
CREATE INDEX idx_price_history_session ON price_history(session_id);
```

**Эта таблица автоматически создается при инициализации БД.**

---

## API Endpoints

### 1. Запуск дифференциального парсинга

```bash
POST /api/parse-differential
Content-Type: application/json

{
  "minPrice": 0,
  "maxPrice": 999999999,
  "region": null,
  "maxPages": 200,
  "concurrentRequests": 500
}
```

**Ответ:**
```json
{
  "sessionId": "session_1735404000000_abc123def",
  "status": "started",
  "message": "Дифференциальный парсинг начался"
}
```

### 2. Получение статуса дифференциального парсинга

```bash
GET /api/sessions/{sessionId}/status
```

**Ответ:**
```json
{
  "sessionId": "session_1735404000000_abc123def",
  "status": "completed",
  "progress": 100,
  "listingsCount": 150,
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

### 3. Получение данных с изменениями цен

```bash
GET /api/sessions/{sessionId}/data
```

**Ответ:**
```json
{
  "sessionId": "session_1735404000000_abc123def",
  "isDifferential": true,
  "count": 150,
  "priceChangesCount": 45,
  "priceChangesSummary": {
    "total": 45,
    "increased": 30,
    "decreased": 15,
    "totalPriceDelta": 125000
  },
  "listings": [
    {
      "number": "А123ВХ77",
      "price": 250000,
      "region": "Москва",
      ...
    }
  ],
  "priceChanges": [
    {
      "number": "А456DE99",
      "oldPrice": 300000,
      "newPrice": 280000,
      "priceDelta": -20000,
      "changeDirection": "decreased"
    },
    {
      "number": "В789КХ12",
      "oldPrice": 150000,
      "newPrice": 165000,
      "priceDelta": 15000,
      "changeDirection": "increased"
    }
  ]
}
```

### 4. История цен для конкретного номера

```bash
GET /api/price-history/{number}?limit=10
```

**Пример:**
```bash
GET /api/price-history/А123ВХ77?limit=10
```

**Ответ:**
```json
{
  "success": true,
  "number": "А123ВХ77",
  "count": 3,
  "history": [
    {
      "id": 1,
      "number": "А123ВХ77",
      "old_price": 240000,
      "new_price": 250000,
      "price_delta": 10000,
      "change_direction": "increased",
      "updated_at": "2025-01-20T15:30:00Z"
    },
    {
      "id": 2,
      "number": "А123ВХ77",
      "old_price": 230000,
      "new_price": 240000,
      "price_delta": 10000,
      "change_direction": "increased",
      "updated_at": "2025-01-19T15:30:00Z"
    },
    {
      "id": 3,
      "number": "А123ВХ77",
      "old_price": 200000,
      "new_price": 230000,
      "price_delta": 30000,
      "change_direction": "increased",
      "updated_at": "2025-01-18T15:30:00Z"
    }
  ]
}
```

### 5. Все изменения цен за период

```bash
GET /api/price-changes?days=7&limit=1000
```

**Ответ:**
```json
{
  "success": true,
  "period": "7 days",
  "count": 285,
  "changes": [
    {
      "id": 1001,
      "number": "А123ВХ77",
      "old_price": 240000,
      "new_price": 250000,
      "price_delta": 10000,
      "change_direction": "increased",
      "updated_at": "2025-01-20T15:30:00Z"
    },
    ...
  ]
}
```

### 6. Статистика по изменениям цен

```bash
GET /api/price-changes/stats?days=7
```

**Ответ:**
```json
{
  "success": true,
  "period": "7 days",
  "statistics": {
    "totalChanges": 285,
    "increased": 180,
    "decreased": 105,
    "unchanged": 0,
    "avgDelta": 5250,
    "minDelta": -50000,
    "maxDelta": 80000
  }
}
```

### 7. Все номера из БД

```bash
GET /api/all-numbers
```

**Ответ:**
```json
{
  "success": true,
  "count": 5230,
  "numbers": [
    {
      "number": "А123ВХ77",
      "currentPrice": 250000
    },
    {
      "number": "В456DE99",
      "currentPrice": 280000
    },
    ...
  ]
}
```

---

## Примеры использования

### Пример 1: Базовый дифференциальный парсинг

```bash
# 1. Запуск дифференциального парсинга
curl -X POST http://localhost:3000/api/parse-differential \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 50}'

# Ответ:
# {
#   "sessionId": "session_1735404000000_abc123def",
#   "status": "started"
# }

# 2. Проверка статуса
curl http://localhost:3000/api/sessions/session_1735404000000_abc123def/status

# 3. Получение результатов
curl http://localhost:3000/api/sessions/session_1735404000000_abc123def/data
```

### Пример 2: Анализ цен

```javascript
// Получить все изменения цен за последнюю неделю
async function getPriceAnalytics() {
  const response = await fetch('/api/price-changes?days=7');
  const data = await response.json();

  const analysis = {
    totalChanges: data.count,
    increased: data.changes.filter(c => c.change_direction === 'increased').length,
    decreased: data.changes.filter(c => c.change_direction === 'decreased').length,
    avgIncrease: data.changes
      .filter(c => c.change_direction === 'increased')
      .reduce((sum, c) => sum + c.price_delta, 0) / data.count,
    avgDecrease: data.changes
      .filter(c => c.change_direction === 'decreased')
      .reduce((sum, c) => sum + c.price_delta, 0) / data.count
  };

  return analysis;
}
```

### Пример 3: История цены конкретного объявления

```javascript
async function getPriceHistory(number) {
  const response = await fetch(`/api/price-history/${number}?limit=20`);
  const data = await response.json();

  if (!data.success) {
    console.error('История цен не найдена');
    return null;
  }

  // Анализируем тренд цены
  const trend = data.history.map(h => ({
    date: h.updated_at,
    price: h.new_price,
    delta: h.price_delta,
    direction: h.change_direction
  }));

  return trend;
}
```

---

## Архитектура

### Поток данных при дифференциальном парсинге:

```
1. POST /api/parse-differential
   ↓
2. runDifferentialParserWithDB()
   ↓
3. parser.parse() — парсит сайт
   ↓
4. db.getDifferentialListings() — сравнивает с БД
   ├─ getExistingNumbers() — получает все номера из БД
   ├─ Фильтрует новые объявления
   └─ Записывает изменения цен в price_history
   ↓
5. db.insertOrUpdateListing() — сохраняет новые объявления
   ↓
6. Сессия обновляется с результатами
   ├─ newItems: количество новых
   ├─ updatedItems: количество с изменением цены
   ├─ unchangedItems: количество без изменений
   └─ priceChanges: массив с деталями изменений
   ↓
7. GET /api/sessions/{id}/data — возвращает результаты
```

### Структура функций дифференциального парсинга:

#### db-pg.js (PostgreSQL):
- `getExistingNumbers()` — получает все номера и их цены
- `getDifferentialListings()` — главная функция сравнения
- `recordPriceChange()` — записывает изменение в history
- `getPriceHistory()` — история для одного номера
- `getRecentPriceChanges()` — все изменения за период
- `getPriceChangeStats()` — статистика по изменениям

#### parser-db.js:
- `saveDifferentialListingsToDB()` — дифференциальное сохранение
- `runDifferentialParserWithDB()` — запуск дифференциального парсинга

#### server.js:
- `POST /api/parse-differential` — endpoint для запуска
- Обновленный `/api/sessions/:id/data` — вывод результатов

---

## 🎯 Когда использовать

### Используйте обычный парсинг (`/api/parse`):
- ✅ Первый запуск (создание базы данных)
- ✅ Полное обновление всех данных
- ✅ Нужны абсолютно все объявления

### Используйте дифференциальный парсинг (`/api/parse-differential`):
- ✅ Регулярные обновления (ежедневно)
- ✅ Нужны только новые объявления
- ✅ Отслеживание изменений цен
- ✅ Анализ рыночной динамики
- ✅ Экономия трафика и памяти

---

## 📊 Примеры аналитики

### Мониторинг цен по времени:

```javascript
// Получить среднюю цену за каждый день последней недели
async function getDailyAveragePrice() {
  const stats = await fetch('/api/price-changes/stats?days=7').then(r => r.json());

  return {
    period: 'last 7 days',
    totalChanges: stats.statistics.totalChanges,
    priceIncreases: stats.statistics.increased,
    priceDecreases: stats.statistics.decreased,
    averageChange: stats.statistics.avgDelta,
    maxIncrease: stats.statistics.maxDelta,
    maxDecrease: stats.statistics.minDelta
  };
}
```

### Найти объявления с наибольшим изменением цены:

```javascript
async function getMaxPriceChanges(limit = 10) {
  const response = await fetch('/api/price-changes?limit=1000');
  const data = await response.json();

  const sorted = data.changes
    .sort((a, b) => Math.abs(b.price_delta) - Math.abs(a.price_delta))
    .slice(0, limit);

  return sorted;
}
```

---

## ⚙️ Конфигурация

Дифференциальный парсинг использует те же параметры, что и обычный парсинг:

```json
{
  "minPrice": 0,           // Минимальная цена
  "maxPrice": 999999999,   // Максимальная цена
  "region": null,          // Регион (опционально)
  "maxPages": 200,         // Максимум страниц для парсинга
  "concurrentRequests": 500,  // Параллельные запросы
  "requestDelayMs": 50     // Задержка между запросами
}
```

---

## 🔐 Безопасность

- ✅ Автоматическое создание таблицы price_history
- ✅ Использование подготовленных запросов (защита от SQL-инъекций)
- ✅ Индексы для быстрого поиска
- ✅ Внешний ключ на parse_sessions для целостности

---

## 📈 Производительность

**Дифференциальный парсинг быстрее:**
- Не повторяет парсинг существующих объявлений
- Сравнение данных выполняется в БД (быстро)
- История цен индексирована для быстрого поиска
- Меньше данных для передачи клиенту

**Рекомендации:**
- Используйте дифференциальный парсинг для регулярных обновлений
- Кэшируйте результаты getExistingNumbers() для больших БД
- Настраивайте limit при запросе больших периодов истории

---

## ✨ Готово!

Система полностью поддерживает дифференциальный парсинг и отслеживание цен!

**Дальше:**
1. Запустите парсинг: `POST /api/parse-differential`
2. Проверяйте статус: `GET /api/sessions/{id}/status`
3. Получайте результаты: `GET /api/sessions/{id}/data`
4. Анализируйте цены: `GET /api/price-changes`

---

**Версия:** 1.0
**Дата:** 2025-01-20
**Поддержка:** MySQL 5.7+ и PostgreSQL 10+
