# 📚 Справочник API

Полный список всех доступных endpoints с примерами.

---

## 🔗 Base URL

```
http://localhost:3000
```

---

## 📊 ПОЛУЧЕНИЕ ДАННЫХ

### GET /api/data
Получить объявления из БД с фильтрацией

**Параметры:**
- `minPrice` (int) - минимальная цена, default: 0
- `maxPrice` (int) - максимальная цена, default: 999999999
- `region` (string) - код региона, default: все
- `limit` (int) - максимум результатов, default: 10000
- `sort` (string) - поле сортировки, default: updatedAt
- `order` (string) - ASC или DESC, default: DESC

**Пример:**
```bash
curl "http://localhost:3000/api/data?minPrice=100000&maxPrice=500000&region=77&limit=20"
```

**Ответ:**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": 1,
      "number": "А123ВХ77",
      "price": 250000,
      "region": "77",
      "status": "active",
      "datePosted": "2024-01-15 10:30:00",
      "dateUpdated": "2024-01-20 15:45:00",
      "seller": "Иван Иванов",
      "url": "https://autonomera777.net/standart/12345",
      "parsedAt": "2024-01-20 18:00:00",
      "updatedAt": "2024-01-20 18:00:00"
    }
    // ... остальные объявления
  ]
}
```

---

### GET /api/statistics
Получить статистику по объявлениям

**Параметры:** нет

**Пример:**
```bash
curl http://localhost:3000/api/statistics
```

**Ответ:**
```json
{
  "success": true,
  "statistics": {
    "total": 5432,
    "regionsCount": 85,
    "sellersCount": 234,
    "avgPrice": 320000,
    "minPrice": 50000,
    "maxPrice": 1500000,
    "lastUpdate": "2024-01-20"
  }
}
```

---

## 💾 ЭКСПОРТ ДАННЫХ

### GET /api/export
Экспортировать данные в CSV или JSON

**Параметры:**
- `format` (string) - "csv" или "json", default: csv
- `minPrice` (int) - минимальная цена
- `maxPrice` (int) - максимальная цена
- `region` (string) - регион

**Пример (CSV):**
```bash
curl "http://localhost:3000/api/export?format=csv&minPrice=100000&maxPrice=500000" \
  -o autonomera777.csv
```

**Пример (JSON):**
```bash
curl "http://localhost:3000/api/export?format=json" \
  -o autonomera777.json
```

**CSV формат:**
```
number,price,region,status,datePosted,dateUpdated,seller,url,updatedAt
А123ВХ77,250000,77,active,2024-01-15 10:30:00,2024-01-20 15:45:00,Иван Иванов,https://...,2024-01-20 18:00:00
...
```

---

## 🗄️ ИНФОРМАЦИЯ О БД

### GET /api/db/status
Проверить статус подключения к БД

**Параметры:** нет

**Пример:**
```bash
curl http://localhost:3000/api/db/status
```

**Ответ:**
```json
{
  "success": true,
  "database": {
    "connected": true,
    "host": "localhost",
    "database": "autonomera777",
    "listingsCount": 5432,
    "completedSessions": 12,
    "timestamp": "2024-01-20T18:30:00.000Z"
  }
}
```

---

## 📜 ИСТОРИЯ ПАРСИНГА

### GET /api/parse-sessions
Получить список всех сессий парсинга

**Параметры:** нет

**Пример:**
```bash
curl http://localhost:3000/api/parse-sessions
```

**Ответ:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "parse-1705772400000",
      "startedAt": "2024-01-20 10:00:00",
      "completedAt": "2024-01-20 10:45:00",
      "status": "completed",
      "totalItems": 2500,
      "newItems": 150,
      "updatedItems": 50,
      "error": null
    },
    {
      "id": "parse-1705772395000",
      "startedAt": "2024-01-19 00:00:15",
      "completedAt": "2024-01-19 00:45:30",
      "status": "completed",
      "totalItems": 5432,
      "newItems": 200,
      "updatedItems": 100,
      "error": null
    }
  ]
}
```

---

### GET /api/cron-logs
Получить логи автоматических обновлений

**Параметры:** нет

**Пример:**
```bash
curl http://localhost:3000/api/cron-logs
```

**Ответ:**
```json
{
  "success": true,
  "logs": [
    {
      "id": 1,
      "scheduledTime": "2024-01-20 00:00:00",
      "startedAt": "2024-01-20 00:00:15",
      "completedAt": "2024-01-20 00:45:30",
      "status": "completed",
      "itemsProcessed": 5432,
      "error": null
    },
    {
      "id": 2,
      "scheduledTime": "2024-01-21 00:00:00",
      "startedAt": "2024-01-21 00:00:10",
      "completedAt": null,
      "status": "running",
      "itemsProcessed": 0,
      "error": null
    }
  ]
}
```

---

## 🧹 УПРАВЛЕНИЕ ДАННЫМИ

### DELETE /api/data/old
Удалить старые (неактивные) данные

**Параметры:**
- `days` (int) - сколько дней в прошлое, default: 30

**Пример:**
```bash
# Удалить неактивные объявления старше 30 дней
curl -X DELETE "http://localhost:3000/api/data/old?days=30"

# Удалить старше 60 дней
curl -X DELETE "http://localhost:3000/api/data/old?days=60"
```

**Ответ:**
```json
{
  "success": true,
  "deleted": 150,
  "message": "Удалено 150 записей старше 30 дней"
}
```

---

### DELETE /api/data/clear
**ВНИМАНИЕ:** Удалить ВСЕ данные (только development!)

**Параметры:** нет

**Пример:**
```bash
curl -X DELETE http://localhost:3000/api/data/clear
```

**Ответ:**
```json
{
  "success": true,
  "message": "Все данные очищены"
}
```

**Работает только если:** `NODE_ENV=development`

---

## 🔍 ЗДОРОВЬЕ СИСТЕМЫ

### GET /api/health
Простая проверка что сервер запущен

**Параметры:** нет

**Пример:**
```bash
curl http://localhost:3000/api/health
```

**Ответ:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-20T18:30:00.000Z",
  "activeSessions": 2
}
```

---

## 🔄 ПАРСИНГ (ОРИГИНАЛЬНЫЕ ENDPOINTS)

### POST /api/parse
Запустить парсинг (оригинальный endpoint)

**Параметры (JSON body):**
- `minPrice` (int) - минимальная цена
- `maxPrice` (int) - максимальная цена
- `region` (string) - регион
- `maxPages` (int) - максимум страниц
- `concurrentRequests` (int) - параллельные запросы

**Пример:**
```bash
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "minPrice": 0,
    "maxPrice": 500000,
    "maxPages": 50,
    "concurrentRequests": 500
  }'
```

**Ответ:**
```json
{
  "sessionId": "session_1705772400000_abc123def",
  "status": "started",
  "message": "Парсинг начался"
}
```

---

### GET /api/sessions/:sessionId/status
Получить статус сессии парсинга

**Параметры:**
- `sessionId` (path) - ID сессии из /api/parse

**Пример:**
```bash
curl http://localhost:3000/api/sessions/session_1705772400000_abc123def/status
```

**Ответ:**
```json
{
  "sessionId": "session_1705772400000_abc123def",
  "status": "completed",
  "totalListings": 2500,
  "progress": 100,
  "duration": "45 seconds",
  "avgPrice": 320000,
  "minPrice": 50000,
  "maxPrice": 1500000,
  "uniqueRegions": 85,
  "uniqueSellers": 234,
  "regions": ["77", "50", "99", ...]
}
```

---

### GET /api/sessions/:sessionId/data
Получить данные из сессии

**Параметры:**
- `sessionId` (path) - ID сессии

**Пример:**
```bash
curl http://localhost:3000/api/sessions/session_1705772400000_abc123def/data
```

---

### GET /api/sessions/:sessionId/export
Экспортировать данные из сессии

**Параметры:**
- `sessionId` (path) - ID сессии
- `format` (query) - "csv" или "json"

**Пример:**
```bash
curl "http://localhost:3000/api/sessions/session_1705772400000_abc123def/export?format=csv" \
  -o session_data.csv
```

---

## 📝 КОДЫ ОШИБОК

### 200 OK
Успешный запрос

### 404 Not Found
Ресурс не найден (неверный ID сессии, неверный endpoint)

```json
{
  "error": "Endpoint не найден",
  "path": "/api/invalid",
  "method": "GET"
}
```

### 500 Internal Server Error
Ошибка на сервере

```json
{
  "error": "Внутренняя ошибка сервера",
  "message": "Detailed error message"
}
```

---

## 🧪 ПРИМЕРЫ КОМАНД

### Базовые операции

```bash
# Получить все данные
curl http://localhost:3000/api/data

# Статистика
curl http://localhost:3000/api/statistics

# Статус БД
curl http://localhost:3000/api/db/status

# Проверить здоровье
curl http://localhost:3000/api/health
```

### С фильтрацией

```bash
# От 100k до 500k в Москве
curl "http://localhost:3000/api/data?minPrice=100000&maxPrice=500000&region=77"

# Первые 50 объявлений
curl "http://localhost:3000/api/data?limit=50"

# Дорогие объявления
curl "http://localhost:3000/api/data?minPrice=1000000"
```

### Экспорт

```bash
# CSV всех данных
curl "http://localhost:3000/api/export?format=csv" -o all_data.csv

# JSON с фильтром
curl "http://localhost:3000/api/export?format=json&minPrice=50000" -o data.json

# CSV конкретного региона
curl "http://localhost:3000/api/export?format=csv&region=77" -o moscow.csv
```

### История и логи

```bash
# Все сессии парсинга
curl http://localhost:3000/api/parse-sessions

# Логи автообновлений
curl http://localhost:3000/api/cron-logs

# Удалить старые данные
curl -X DELETE "http://localhost:3000/api/data/old?days=30"
```

---

## 🎯 Распространённые сценарии

### Сценарий 1: Получить статистику
```bash
curl http://localhost:3000/api/statistics | jq '.statistics'
```

### Сценарий 2: Экспортировать дешёвые номера
```bash
curl "http://localhost:3000/api/export?format=csv&maxPrice=200000" \
  -o cheap_numbers.csv
```

### Сценарий 3: Проверить последнее обновление
```bash
curl http://localhost:3000/api/cron-logs | jq '.[0].completedAt'
```

### Сценарий 4: Получить данные для анализа
```bash
curl "http://localhost:3000/api/data?limit=1000" | jq '.data | map({number, price, region})'
```

### Сценарий 5: Запустить парсинг вручную
```bash
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 50}'
```

---

## 🔐 Безопасность

### HTTPS на production
Используйте HTTPS для всех запросов в production среде.

### Аутентификация
В текущей версии нет встроенной аутентификации.
Для production используйте:
- API ключи
- JWT токены
- OAuth2

### Rate limiting
Используйте reverse proxy (nginx) для rate limiting.

---

## 📖 Документация

- **DATABASE_SETUP.md** - Полное руководство
- **QUICK_DB_START.md** - Быстрый старт
- **SYSTEM_IMPLEMENTATION.md** - Архитектура
- **API_EXAMPLES.sh** - Примеры команд

---

**Последнее обновление:** 2024-01-20
**Версия API:** 1.0
