# 🚀 Parser Autonomera777 с MySQL БД и автоматическими обновлениями

**Полнофункциональная система парсинга с MySQL БД, REST API и автоматическими ежедневными обновлениями**

---

## ✨ Что это?

Расширение оригинального парсера Autonomera777 с:
- ✅ **MySQL база данных** - сохранение всех объявлений
- ✅ **REST API** - доступ к данным программно
- ✅ **Автоматические обновления** - ежедневный парсинг (cron)
- ✅ **Полная история** - отслеживание всех изменений
- ✅ **Экспорт данных** - CSV, JSON форматы

---

## 📋 Быстрый старт (3 минуты)

### 1. Убедитесь, что MySQL запущен

```bash
# Windows: запустите MySQL сервис
# Linux: sudo systemctl start mysql
# Mac: brew services start mysql
```

### 2. Создайте БД

```bash
mysql -u root -p -e "CREATE DATABASE autonomera777;"
```

### 3. Отредактируйте .env

```env
DB_PASSWORD=ВАШ_ПАРОЛЬ_MYSQL
```

### 4. Запустите

```bash
npm install
npm start
```

### 5. Откройте

```
http://localhost:3000
```

**Готово!** Система работает. 🎉

---

## 📚 Документация

| Документ | Для кого | Содержание |
|----------|----------|-----------|
| **QUICK_DB_START.md** | Новичков | 5-минутный старт |
| **DATABASE_SETUP.md** | Всех | Полное руководство (450+ строк) |
| **SETUP_CHECKLIST.md** | Установщиков | Пошаговая инструкция |
| **API_REFERENCE.md** | Разработчиков | Все endpoints и примеры |
| **SYSTEM_IMPLEMENTATION.md** | Архитекторов | Как устроена система |
| **WHAT_WAS_DONE.md** | Аналитиков | Что было сделано |

---

## 🎯 Основные возможности

### 💾 Сохранение в БД

```
Парсер → MySQL БД (таблица listings)
      → История (таблица parse_sessions)
      → Логи (таблица cron_logs)
```

**Что сохраняется:**
- Номер (А123ВХ77)
- Цена в рублях
- Регион
- Даты размещения и обновления
- ФИО продавца
- Ссылка на объявление
- Статус (активно/неактивно)

### 📅 Ежедневные обновления

```
00:00 каждый день (настраивается)
         ↓
Планировщик (node-cron) запускает парсер
         ↓
Результаты сохраняются в БД
         ↓
Логируется в таблицу cron_logs
```

### 🌐 REST API

```
GET  /api/data              → Все объявления
GET  /api/statistics        → Статистика
GET  /api/export            → Экспорт CSV/JSON
GET  /api/db/status         → Статус БД
GET  /api/parse-sessions    → История
GET  /api/cron-logs         → Логи обновлений
```

---

## 🏗️ Архитектура

### Созданные компоненты

```
db.js
  ├─ Подключение к MySQL
  ├─ Создание таблиц
  ├─ CRUD операции
  └─ Статистика

parser-db.js
  ├─ Адаптер парсера
  ├─ Сохранение в БД
  └─ Управление сессиями

scheduler.js
  ├─ node-cron расписание
  ├─ Автоматический запуск
  └─ Логирование

api-db-routes.js
  ├─ 8+ REST endpoints
  ├─ Фильтрация данных
  └─ Экспорт
```

### БД Schema

**Таблица listings** (объявления)
```sql
- id (PK)
- number (уникальный)
- price, region, status
- datePosted, dateUpdated
- seller, url
- parsedAt, updatedAt
+ индексы
```

**Таблица parse_sessions** (история парсинга)
```sql
- id (сессия)
- startedAt, completedAt
- status, totalItems
- newItems, updatedItems
- error (если были)
```

**Таблица cron_logs** (логи обновлений)
```sql
- id (PK)
- scheduledTime, startedAt, completedAt
- status, itemsProcessed, error
```

---

## 🚀 Использование

### Веб интерфейс

```
http://localhost:3000              → Главная страница
http://localhost:3000/run          → Запустить парсинг
http://localhost:3000/session/:id  → Статус сессии
```

### API примеры

```bash
# Получить все объявления
curl http://localhost:3000/api/data

# Статистика
curl http://localhost:3000/api/statistics

# С фильтрацией
curl "http://localhost:3000/api/data?minPrice=100000&maxPrice=500000&region=77"

# Экспортировать CSV
curl "http://localhost:3000/api/export?format=csv" -o data.csv

# Логи обновлений
curl http://localhost:3000/api/cron-logs
```

### JavaScript

```javascript
// Получить данные
const response = await fetch('/api/data');
const { data } = await response.json();

// Статистика
const stats = await fetch('/api/statistics').then(r => r.json());

// Экспортировать
const csv = await fetch('/api/export?format=csv').then(r => r.blob());
```

---

## ⚙️ Конфигурация

### .env переменные

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password    # ← Обязательно измените!
DB_NAME=autonomera777

# Scheduling
PARSER_TIME=00:00            # Время парсинга
PARSER_TIMEZONE=Europe/Moscow

# Parser
MAX_PAGES=50
CONCURRENT_REQUESTS=500
REQUEST_DELAY=1000
```

### Изменить время парсинга

```env
PARSER_TIME=06:00            # Вместо 00:00
```

Перезагрузите сервер.

---

## 📊 Примеры использования

### Пример 1: Получить объявления Москвы

```bash
curl "http://localhost:3000/api/data?region=77&limit=100"
```

### Пример 2: Экспортировать в CSV

```bash
curl "http://localhost:3000/api/export?format=csv&minPrice=50000&maxPrice=500000" \
  -o moscow_listings.csv
```

### Пример 3: Проверить статистику

```bash
curl http://localhost:3000/api/statistics | jq '.statistics'
```

### Пример 4: Посмотреть логи обновлений

```bash
curl http://localhost:3000/api/cron-logs | jq '.logs[0]'
```

### Пример 5: Запустить парсинг вручную

```bash
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 50}'
```

---

## 🔍 Отладка

### Проверить статус

```bash
curl http://localhost:3000/api/db/status
curl http://localhost:3000/api/health
```

### Проверить БД напрямую

```bash
mysql -u root -p autonomera777
SELECT COUNT(*) FROM listings;
SELECT * FROM cron_logs ORDER BY startedAt DESC LIMIT 1;
```

### Посмотреть логи сервера

```bash
# При запуске должны быть сообщения об инициализации БД и планировщика
npm start
```

---

## ❌ Распространённые проблемы

### "ECONNREFUSED 127.0.0.1:3306"
→ MySQL не запущен. Запустите MySQL сервис.

### "Unknown database 'autonomera777'"
→ БД не создана. Выполните: `CREATE DATABASE autonomera777;`

### "Access denied for user 'root'"
→ Неправильный пароль в `.env`. Проверьте DB_PASSWORD.

### "Парсинг не запускается"
→ Проверьте PARSER_TIME в `.env` (формат: HH:MM)

---

## 📈 Производительность

### БД
- ~5000-10000+ объявлений (зависит от объёма на сайте)
- Быстрый поиск по индексам (region, price, status)
- Компактное хранилище

### API
- JSON ответы (до 50k объявлений одновременно)
- Фильтрация на уровне БД
- Кэширование возможно

### Планировщик
- Низкие ресурсы в режиме ожидания
- Парсинг запускается по расписанию
- Логирование всех операций

---

## 🎓 Для разработчиков

### Добавить новый endpoint

```javascript
// В api-db-routes.js
router.get('/my-endpoint', async (req, res) => {
  const data = await db.getListings(filters);
  res.json({ success: true, data });
});
```

### Запустить парсер вручную

```javascript
const { scheduledParseTask } = require('./parser-db');
await scheduledParseTask();
```

### Работать с БД

```javascript
const db = require('./db');
const listings = await db.getListings({ region: '77' });
const stats = await db.getListingsStats();
```

---

## 📦 Файлы проекта

### Новые файлы
```
db.js                    (263 строк) - БД модуль
parser-db.js             (185 строк) - Адаптер парсера
scheduler.js             (160 строк) - Планировщик
api-db-routes.js         (310 строк) - API endpoints
.env                     (25 строк)  - Конфигурация
```

### Документация
```
DATABASE_SETUP.md        - Полное руководство
QUICK_DB_START.md        - Быстрый старт
SETUP_CHECKLIST.md       - Инструкция установки
API_REFERENCE.md         - Справочник API
SYSTEM_IMPLEMENTATION.md - Описание архитектуры
WHAT_WAS_DONE.md         - Что было реализовано
API_EXAMPLES.sh          - Примеры команд
```

---

## ✅ Требования

### Системные
- Node.js 14.0.0+
- npm 6.0.0+
- MySQL 5.7+ или MariaDB 10.3+

### Диск
- ~100 MB для приложения
- ~50 MB для БД (на 10000 объявлений)

### Память
- ~200 MB для Node.js
- ~100 MB для MySQL

---

## 🚀 Развёртывание

### Docker

```bash
docker build -t autonomera-parser .
docker run -p 3000:3000 \
  -e DB_PASSWORD=password \
  autonomera-parser
```

### Cloud (Railway, Heroku, etc.)

1. Создайте MySQL БД на платформе
2. Скопируйте `DATABASE_SETUP.md` инструкции
3. Скопируйте параметры БД в `.env`
4. Задеплойте приложение

---

## 📞 Поддержка

### Документация
- `DATABASE_SETUP.md` - подробное руководство
- `API_REFERENCE.md` - все endpoints

### Проверка
- `/api/health` - проверка сервера
- `/api/db/status` - статус БД
- `/api/cron-logs` - логи обновлений

### Отладка
- Посмотрите логи при запуске
- Проверьте `.env` конфиг
- Убедитесь, что MySQL работает

---

## 📄 Лицензия

MIT

---

## ✨ Результат

**Вы получили:**
- ✅ MySQL БД для сохранения объявлений
- ✅ REST API для программного доступа
- ✅ Ежедневные автоматические обновления
- ✅ Полную историю и статистику
- ✅ Экспорт данных в CSV/JSON
- ✅ Полную документацию

**Система готова к использованию!** 🎉

---

**Начните:**
1. Отредактируйте `.env`
2. Запустите `npm start`
3. Откройте http://localhost:3000
4. Система автоматически обновляется каждый день!

---

**Версия:** 1.0
**Последнее обновление:** 2024-01-20
**Статус:** ✅ Готово к использованию
