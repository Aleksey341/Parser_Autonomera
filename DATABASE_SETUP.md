# 🗄️ Система парсинга с БД MySQL

Полное руководство по настройке системы автоматического парсинга с сохранением в MySQL БД и ежедневными обновлениями.

## 📋 Содержание

1. [Требования](#требования)
2. [Установка и настройка](#установка-и-настройка)
3. [Конфигурация](#конфигурация)
4. [API Endpoints](#api-endpoints)
5. [Автоматические обновления](#автоматические-обновления)
6. [Примеры использования](#примеры-использования)
7. [Отладка](#отладка)

---

## 🔧 Требования

### Системные требования
- **Node.js**: 14.0.0+
- **npm**: 6.0.0+
- **MySQL**: 5.7+ или **MariaDB**: 10.3+

### Установленные зависимости
```json
{
  "mysql2": "^3.6.5",
  "node-cron": "^3.0.3"
}
```

---

## 💻 Установка и настройка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Создание базы данных MySQL

Откройте MySQL/MariaDB и выполните:

```sql
CREATE DATABASE autonomera777;
USE autonomera777;
```

### 3. Конфигурация .env файла

Скопируйте/отредактируйте `.env` файл в корне проекта:

```bash
# .env

# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_secure_password
DB_NAME=autonomera777

# Parser Configuration
PARSER_TIME=00:00
PARSER_TIMEZONE=Europe/Moscow
MAX_PAGES=50
MIN_PRICE=0
MAX_PRICE=999999999
CONCURRENT_REQUESTS=500
REQUEST_DELAY=1000
REQUEST_TIMEOUT=40000

# Puppeteer Configuration
PUPPETEER_HEADLESS=true
PUPPETEER_NO_SANDBOX=false
```

### 4. Запуск сервера

```bash
npm start
```

Сервер инициализирует БД автоматически и создаст необходимые таблицы.

---

## ⚙️ Конфигурация

### Параметры .env

| Параметр | Описание | Значение по умолчанию |
|----------|---------|----------------------|
| `PORT` | Порт сервера | 3000 |
| `NODE_ENV` | Окружение | development |
| `DB_HOST` | Хост MySQL | localhost |
| `DB_PORT` | Порт MySQL | 3306 |
| `DB_USER` | Пользователь БД | root |
| `DB_PASSWORD` | Пароль БД | (пусто) |
| `DB_NAME` | Имя БД | autonomera777 |
| `PARSER_TIME` | Время парсинга (HH:MM) | 00:00 (полночь) |
| `PARSER_TIMEZONE` | Часовой пояс | Europe/Moscow |
| `MAX_PAGES` | Макс. страниц для парсинга | 50 |
| `CONCURRENT_REQUESTS` | Параллельные запросы | 500 |
| `REQUEST_DELAY` | Задержка между запросами (мс) | 1000 |

### Структура таблиц БД

#### 1. `listings` - главная таблица объявлений

```sql
CREATE TABLE listings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(15) UNIQUE NOT NULL,      -- Номер А123ВХ77
  price INT,                                -- Цена в рублях
  region VARCHAR(100),                      -- Регион (код или название)
  status VARCHAR(50) DEFAULT 'active',      -- active, inactive
  datePosted DATETIME,                      -- Дата размещения
  dateUpdated DATETIME,                     -- Дата обновления
  seller VARCHAR(255),                      -- ФИО продавца
  url VARCHAR(500) UNIQUE,                  -- Ссылка на объявление
  parsedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_region (region),
  INDEX idx_status (status),
  INDEX idx_updatedAt (updatedAt),
  INDEX idx_price (price)
);
```

#### 2. `parse_sessions` - сессии парсинга

```sql
CREATE TABLE parse_sessions (
  id VARCHAR(36) PRIMARY KEY,
  startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME NULL,
  status VARCHAR(50) DEFAULT 'running',     -- running, completed, failed
  totalItems INT DEFAULT 0,
  newItems INT DEFAULT 0,
  updatedItems INT DEFAULT 0,
  params JSON,                               -- Параметры парсинга
  error TEXT,

  INDEX idx_status (status),
  INDEX idx_startedAt (startedAt)
);
```

#### 3. `cron_logs` - логи автоматических обновлений

```sql
CREATE TABLE cron_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scheduledTime DATETIME,
  startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME NULL,
  status VARCHAR(50) DEFAULT 'running',
  itemsProcessed INT DEFAULT 0,
  error TEXT,

  INDEX idx_startedAt (startedAt),
  INDEX idx_status (status)
);
```

---

## 🌐 API Endpoints

### Данные из БД

#### `GET /api/data`
Получить все объявления из БД с фильтрацией

**Параметры:**
```
?minPrice=0&maxPrice=999999999&region=77&limit=10000
```

**Ответ:**
```json
{
  "success": true,
  "count": 1500,
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
      "updatedAt": "2024-01-20 15:45:00"
    }
  ]
}
```

#### `GET /api/statistics`
Получить статистику по объявлениям

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

#### `GET /api/export`
Экспортировать данные в CSV или JSON

**Параметры:**
```
?format=csv&minPrice=0&maxPrice=500000&region=77
```

**Форматы:**
- `format=csv` - CSV с UTF-8 BOM для Excel
- `format=json` - JSON

### Информация о БД

#### `GET /api/db/status`
Статус подключения к БД

```json
{
  "success": true,
  "database": {
    "connected": true,
    "host": "localhost",
    "database": "autonomera777",
    "listingsCount": 5432,
    "completedSessions": 12
  }
}
```

#### `GET /api/parse-sessions`
Список всех сессий парсинга

```json
{
  "success": true,
  "sessions": [
    {
      "id": "parse-1234567890",
      "startedAt": "2024-01-20 10:00:00",
      "completedAt": "2024-01-20 10:45:00",
      "status": "completed",
      "totalItems": 2500,
      "newItems": 150,
      "updatedItems": 50
    }
  ]
}
```

#### `GET /api/cron-logs`
Логи автоматических обновлений

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
    }
  ]
}
```

### Управление данными

#### `DELETE /api/data/old`
Удалить старые данные

**Параметры:**
```
?days=30
```

#### `DELETE /api/data/clear`
Очистить все данные (только в development!)

---

## 📅 Автоматические обновления

### Как работает планировщик

1. **Инициализация**: Планировщик запускается при старте сервера
2. **Время запуска**: Определяется через `PARSER_TIME` в .env (по умолчанию 00:00)
3. **Часовой пояс**: Используется `PARSER_TIMEZONE` (по умолчанию Europe/Moscow)
4. **Выполнение**:
   - Парсер автоматически запускается в указанное время
   - Результаты сохраняются в БД
   - Создается запись в `cron_logs`

### Примеры расписания

**Ежедневно в полночь (00:00):**
```env
PARSER_TIME=00:00
PARSER_TIMEZONE=Europe/Moscow
```

**Ежедневно в 6:00 утра:**
```env
PARSER_TIME=06:00
PARSER_TIMEZONE=Europe/Moscow
```

**Ежедневно в 18:00 (6 PM):**
```env
PARSER_TIME=18:00
PARSER_TIMEZONE=Europe/Moscow
```

### Мониторинг

Проверьте логи выполнения:

```bash
# Последние 10 запусков парсера
curl http://localhost:3000/api/cron-logs

# Статистика
curl http://localhost:3000/api/statistics

# Статус БД
curl http://localhost:3000/api/db/status
```

---

## 💡 Примеры использования

### 1. Запуск парсинга вручную

```bash
# Через веб-интерфейс
http://localhost:3000/run

# Через API
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "minPrice": 0,
    "maxPrice": 500000,
    "maxPages": 50
  }'
```

### 2. Получение всех данных из БД

```bash
curl "http://localhost:3000/api/data?minPrice=100000&maxPrice=400000&region=77"
```

### 3. Экспорт в CSV

```bash
curl "http://localhost:3000/api/export?format=csv&minPrice=0&maxPrice=500000" \
  -o autonomera777.csv
```

### 4. Экспорт в JSON

```bash
curl "http://localhost:3000/api/export?format=json" \
  -o autonomera777.json
```

### 5. Проверка статистики

```bash
curl http://localhost:3000/api/statistics
```

### 6. JavaScript примеры

```javascript
// Получить статистику
fetch('/api/statistics')
  .then(r => r.json())
  .then(data => console.log(data.statistics))

// Получить данные с фильтрацией
fetch('/api/data?minPrice=100000&maxPrice=500000&limit=100')
  .then(r => r.json())
  .then(data => {
    console.log(`Всего объявлений: ${data.count}`);
    data.data.forEach(listing => {
      console.log(`${listing.number} - ${listing.price}₽`);
    });
  })

// Экспортировать в CSV
const downloadCSV = async () => {
  const response = await fetch('/api/export?format=csv');
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'autonomera777.csv';
  a.click();
}
```

---

## 🔍 Отладка

### 1. Проверка подключения к БД

```bash
# Статус БД
curl http://localhost:3000/api/db/status

# Должен вернуть connected: true
```

### 2. Проверка планировщика

```bash
# Посмотрите логи сервера при запуске
# Должны быть сообщения о инициализации планировщика
```

### 3. Проверка таблиц

```sql
-- MySQL консоль
USE autonomera777;
SHOW TABLES;
DESC listings;
SELECT COUNT(*) FROM listings;
```

### 4. Просмотр логов парсинга

```bash
# Все сессии парсинга
curl http://localhost:3000/api/parse-sessions

# Логи автообновлений
curl http://localhost:3000/api/cron-logs
```

### 5. Проверка .env файла

Убедитесь, что `.env` находится в корне проекта с правильными данными:

```bash
# Linux/Mac
cat .env

# Windows PowerShell
Get-Content .env
```

### 6. Часто встречающиеся проблемы

**Ошибка: "ECONNREFUSED 127.0.0.1:3306"**
- MySQL не запущен
- Неправильные параметры подключения в .env
- Проверьте DB_HOST, DB_PORT, DB_USER, DB_PASSWORD

**Ошибка: "Unknown database 'autonomera777'"**
- БД не создана
- Выполните: `CREATE DATABASE autonomera777;`

**Парсинг не запускается автоматически**
- Проверьте PARSER_TIME формат (HH:MM)
- Проверьте PARSER_TIMEZONE
- Посмотрите логи сервера при инициализации

**Данные не сохраняются в БД**
- Проверьте права доступа DB_USER
- Убедитесь, что таблицы созданы
- Посмотрите логи ошибок в консоли

---

## 📊 Архитектура системы

```
┌─────────────────────────────────────────────────────────┐
│                    WEB CLIENT                           │
│              (Браузер / API клиент)                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              EXPRESS СЕРВЕР (Node.js)                   │
│  - Обработка HTTP запросов                              │
│  - REST API endpoints                                   │
│  - Веб-интерфейс                                        │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    ┌─────────┐ ┌──────────┐ ┌────────────┐
    │PARSER   │ │SCHEDULER │ │ API-DB     │
    │(parser- │ │(cron)    │ │ ROUTES     │
    │db.js)   │ │          │ │            │
    └────┬────┘ └─────┬────┘ └─────┬──────┘
         │            │            │
         └────────────┼────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │     MYSQL/MARIADB БД            │
        │  ┌──────────────────────────┐   │
        │  │  listings               │   │
        │  │  parse_sessions         │   │
        │  │  cron_logs              │   │
        │  └──────────────────────────┘   │
        └─────────────────────────────────┘
```

---

## ✅ Чек-лист установки

- [ ] Node.js 14+ установлен
- [ ] MySQL/MariaDB установлен и запущен
- [ ] `npm install` выполнен
- [ ] `.env` файл создан и настроен
- [ ] БД `autonomera777` создана
- [ ] `npm start` работает без ошибок
- [ ] http://localhost:3000 открывается
- [ ] `/api/db/status` показывает connected: true
- [ ] `/api/statistics` возвращает данные

---

Готово! 🎉 Система полностью настроена и готова к работе.
