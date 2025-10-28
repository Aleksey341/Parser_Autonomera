# 🎯 Функция: Результаты парсинга с данными из БД

Руководство по новой функции, которая показывает ВСЕ данные из базы данных в результатах парсинга.

---

## 📋 Содержание

1. [Что изменилось](#что-изменилось)
2. [Как это работает](#как-это-работает)
3. [API примеры](#api-примеры)
4. [Примеры данных](#примеры-данных)
5. [Интеграция](#интеграция)

---

## Что изменилось?

### Раньше (старое поведение)

```
Пользователь нажимает "Начать парсинг"
         ↓
Парсер скрейпит сайт (5000 объявлений)
         ↓
Результат: только 5000 спарсенных объявлений
           (то что было в памяти парсера)
         ↓
Пользователь видит: что парсер собрал сейчас
```

### Теперь (новое поведение)

```
Пользователь нажимает "Начать парсинг"
         ↓
Парсер скрейпит сайт (5000 объявлений)
         ↓
Сохраняет в БД
         ↓
Загружает ВСЕ данные из БД (5230 объявлений)
         ↓
Результат: ВСЕ объявления из БД с полными полями!
           (старые + новые + обновленные)
         ↓
Пользователь видит: полное состояние БД
```

---

## Как это работает?

### Шаг за шагом

```
1. POST /api/parse
   ↓
   Сервер:
   - Создает сессию парсинга
   - Запускает парсер в фоне
   - Возвращает sessionId пользователю

   ↓ (в фоне, асинхронно)

2. parser.parse()
   ↓
   Парсер:
   - Загружает сайт через Puppeteer
   - Парсит HTML через Cheerio
   - Собирает объявления в this.listings
   - Возвращает результат

   ↓

3. runParserWithDB()
   ↓
   Адаптер парсера:
   - Сохраняет объявления в БД
   - Создает/обновляет записи
   - Логирует статистику

   ↓

4. db.getListings() ← НОВЫЙ ШАГ!
   ↓
   БД:
   - Загружает ВСЕ объявления из БД
   - Фильтрует по цене/региону (если нужно)
   - Возвращает полные записи с всеми полями

   ↓

5. session.listings = allListings
   ↓
   Сессия обновляется:
   - listings: ВСЕ данные из БД
   - dbInfo: статистика о том, что произошло
   - status: 'completed'

   ↓

6. Пользователь получает GET /api/sessions/{id}/data
   ↓
   Результат:
   - 5230 объявлений из БД
   - Информация о сохранении
   - Все поля для каждого объявления
```

---

## API примеры

### 1. Запуск парсинга

```bash
POST /api/parse
Content-Type: application/json

{
  "maxPages": 50,
  "minPrice": 100000,
  "maxPrice": 500000,
  "region": "Москва"
}
```

**Ответ:**
```json
{
  "sessionId": "session_1735404000000_abc123def",
  "status": "started",
  "message": "Парсинг начался"
}
```

**Что происходит в фоне:**
```
⏱️ 45 сек.  - Парсинг сайта
⏱️ 2 сек.   - Сохранение в БД
⏱️ 1 сек.   - Загрузка всех данных из БД
────────────────────
⏱️ ~48 сек. - Парсинг готов
```

---

### 2. Проверка статуса парсинга

```bash
GET /api/sessions/session_1735404000000_abc123def/status
```

**Ответ:**
```json
{
  "sessionId": "session_1735404000000_abc123def",
  "status": "completed",
  "progress": 100,
  "listingsCount": 5230,
  "duration": "48s",
  "isDifferential": false
}
```

---

### 3. Получение результатов парсинга

```bash
GET /api/sessions/session_1735404000000_abc123def/data
```

**Ответ:**
```json
{
  "sessionId": "session_1735404000000_abc123def",
  "isDifferential": false,
  "count": 5230,
  "database": {
    "totalListingsInDB": 5230,
    "parsedThisTime": 150,
    "saveResult": {
      "success": true,
      "newItems": 150,
      "updatedItems": 45,
      "total": 5195
    }
  },
  "listings": [
    {
      "id": 1,
      "number": "А123ВХ77",
      "price": 250000,
      "region": "Москва",
      "status": "active",
      "date_posted": "2025-01-20 10:30:00",
      "date_updated": "2025-01-20 15:45:00",
      "seller": "John Doe",
      "url": "https://autonomera777.net/...",
      "parsed_at": "2025-01-20 15:45:00",
      "updated_at": "2025-01-20 15:45:00"
    },
    {
      "id": 2,
      "number": "В456DE99",
      "price": 280000,
      "region": "СПб",
      "status": "active",
      "date_posted": "2025-01-19 14:20:00",
      "date_updated": "2025-01-20 15:40:00",
      "seller": "Maria Sidorova",
      "url": "https://autonomera777.net/...",
      "parsed_at": "2025-01-20 15:40:00",
      "updated_at": "2025-01-20 15:40:00"
    },
    // ... еще 5228 объявлений
  ]
}
```

---

## Примеры данных

### Типичный ответ при парсинге

```json
{
  "sessionId": "session_1735404000000_abc123def",
  "isDifferential": false,
  "count": 5230,
  "database": {
    "totalListingsInDB": 5230,
    "parsedThisTime": 150,
    "saveResult": {
      "success": true,
      "sessionId": "session_1735404000000_abc123def",
      "items": 5000,
      "newItems": 150,
      "updatedItems": 45,
      "unchangedItems": 4805
    }
  },
  "listings": [
    {
      "id": 5230,
      "number": "З789МХ99",
      "price": 180000,
      "region": "Казань",
      "status": "active",
      "date_posted": "2025-01-20 14:15:00",
      "date_updated": null,
      "seller": "Ivan Petrov",
      "url": "https://autonomera777.net/listing/...",
      "parsed_at": "2025-01-20 15:45:00",
      "updated_at": "2025-01-20 15:45:00"
    },
    {
      "id": 5229,
      "number": "И101ОХ88",
      "price": 210000,
      "region": "Москва",
      "status": "active",
      "date_posted": "2025-01-20 15:00:00",
      "date_updated": null,
      "seller": "Alexandra Smirnova",
      "url": "https://autonomera777.net/listing/...",
      "parsed_at": "2025-01-20 15:45:00",
      "updated_at": "2025-01-20 15:45:00"
    }
  ]
}
```

### Как читать результат

```
"count": 5230
  └─ Количество объявлений в результате (из БД)

"database": {
  "totalListingsInDB": 5230,
    └─ Всего объявлений в БД после парсинга

  "parsedThisTime": 150,
    └─ Спарсено в ЭТУ сессию (новых + измененных)

  "saveResult": {
    "newItems": 150,
      └─ Добавлено новых объявлений
    "updatedItems": 45,
      └─ Обновлено цены на существующих
    "unchangedItems": 4805
      └─ Не изменилось (цена та же)
  }
}

"listings": [...]
  └─ ВСЕ объявления из БД с полными полями
```

---

## Интеграция

### На фронтенде (JavaScript)

```javascript
// Запустить парсинг
async function startParsing() {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      maxPages: 50,
      minPrice: 100000,
      maxPrice: 500000
    })
  });

  const data = await response.json();
  const sessionId = data.sessionId;

  // Проверяем статус
  const checkStatus = setInterval(async () => {
    const statusResponse = await fetch(`/api/sessions/${sessionId}/status`);
    const status = await statusResponse.json();

    console.log(`Статус: ${status.status} (${status.progress}%)`);

    if (status.status === 'completed') {
      clearInterval(checkStatus);

      // Получаем результаты из БД
      const resultsResponse = await fetch(`/api/sessions/${sessionId}/data`);
      const results = await resultsResponse.json();

      console.log(`Итого объявлений в БД: ${results.count}`);
      console.log(`Спарсено в эту сессию: ${results.database.parsedThisTime}`);
      console.log(`Новых добавлено: ${results.database.saveResult.newItems}`);

      // Используем результаты
      displayListings(results.listings);
    }
  }, 2000);
}

// Отобразить объявления
function displayListings(listings) {
  const html = listings.map(listing => `
    <div class="listing">
      <h3>${listing.number}</h3>
      <p>Цена: ${listing.price.toLocaleString()} руб.</p>
      <p>Регион: ${listing.region}</p>
      <p>Продавец: ${listing.seller}</p>
      <p>Статус: ${listing.status}</p>
      <p>Обновлено: ${new Date(listing.updated_at).toLocaleString('ru-RU')}</p>
      <a href="${listing.url}" target="_blank">Смотреть объявление</a>
    </div>
  `).join('');

  document.getElementById('listings').innerHTML = html;
}

// Запустить
startParsing();
```

---

### Структура объявления в БД

Каждое объявление содержит следующие поля:

```javascript
{
  id: 1,                    // уникальный ID в БД
  number: "А123ВХ77",      // номер объявления
  price: 250000,           // цена в рублях
  region: "Москва",        // регион
  status: "active",        // статус (active/inactive)
  date_posted: "2025-01-20 10:30:00",   // когда было размещено
  date_updated: "2025-01-20 15:45:00",  // последний апдейт цены/статуса
  seller: "John Doe",      // имя продавца
  url: "https://...",      // прямая ссылка на объявление
  parsed_at: "2025-01-20 15:45:00",     // когда было спарсено
  updated_at: "2025-01-20 15:45:00"     // когда было обновлено в БД
}
```

---

## 🔄 Примеры использования

### Пример 1: Получить только объявления из Москвы

```bash
POST /api/parse
{
  "region": "Москва",
  "maxPages": 30
}

# Затем получить результаты
GET /api/sessions/{sessionId}/data

# Результат будет отфильтрован только Москвой!
```

### Пример 2: Получить только дешевые объявления

```bash
POST /api/parse
{
  "minPrice": 0,
  "maxPrice": 150000,
  "maxPages": 50
}

# Результаты будут только от 0 до 150k
```

### Пример 3: Экспортировать в CSV

```bash
GET /api/sessions/{sessionId}/export?format=csv

# Скачивается файл со всеми объявлениями в CSV формате
```

---

## ⚙️ Техническая информация

### Что происходит в коде

```javascript
// server.js - POST /api/parse endpoint

// 1. Запускаем парсинг в фоне
parser.parse().then(async (result) => {
  // 2. Сохраняем в БД
  const savedData = await runParserWithDB(parser, sessionId);

  // 3. ← ГЛАВНОЕ! Загружаем ВСЕ данные из БД
  const allListings = await db.getListings({
    minPrice: minPrice,
    maxPrice: maxPrice,
    limit: 100000  // получить все
  });

  // 4. Сохраняем в сессию
  session.listings = allListings;  // ВСЕ данные из БД!
  session.dbInfo = {
    totalInDB: allListings.length,
    parsedThisTime: parser.listings.length,
    savedData: savedData
  };
});
```

### Фильтрация по цене/региону

```javascript
// Если пользователь указал minPrice/maxPrice,
// они применяются в db.getListings():

const allListings = await db.getListings({
  minPrice: minPrice === 0 ? 0 : minPrice,
  maxPrice: maxPrice === Infinity ? 999999999 : maxPrice,
  region: region || null,  // если указан регион
  limit: 100000
});

// SQL query (PostgreSQL):
SELECT * FROM listings
WHERE status = 'active'
  AND price >= $1
  AND price <= $2
  [AND region = $3]
ORDER BY updated_at DESC
LIMIT 100000;
```

---

## 📊 Производительность

```
Парсинг сайта:          45 сек.
Сохранение в БД:         2 сек.
Загрузка из БД:          3 сек.  ← НОВОЕ
────────────────────────────────
ИТОГО:                 ~50 сек.

Объем данных:
- Спарсено:   5000 объявлений (память парсера)
- В БД:       5230 объявлений (накопленные данные)
- Возвращено: 5230 объявлений (все из БД)
```

---

## 🎯 Преимущества новой функции

✅ **Полные данные** — все поля объявления из БД
✅ **Актуальное состояние** — всегда видно что в БД
✅ **История** — старые объявления тоже видны
✅ **Статистика** — сколько было добавлено/обновлено
✅ **Фильтрация** — результаты можно фильтровать по цене/региону
✅ **Экспорт** — можно экспортировать результаты в CSV/Excel

---

**Версия:** 1.0
**Дата:** 2025-01-20
