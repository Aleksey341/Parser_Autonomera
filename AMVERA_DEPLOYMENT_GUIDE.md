# 🚀 Инструкция развертывания на Amvera

## Быстрый старт (5 минут)

### 1. Подготовка на Amvera

**В интерфейсе Amvera:**

1. Создать новый сервис → **Applications**
2. Выбрать **GitHub** репозиторий
3. Подключить: `https://github.com/Aleksey341/Parser_Autonomera.git`
4. **Build & Deploy** → Next
5. В **Build settings** оставить defaults
6. В **Environment variables** добавить:

```
DATABASE_URL=postgresql://user:password@amvera-host:port/database
DB_SSL=true
PORT=3000
CRON_ENABLED=true
CRON_TIME=1 0 * * *
PARSER_TIMEZONE=Europe/Moscow
MIN_PRICE=0
MAX_PRICE=10000000
MAX_PAGES=100
REQUEST_DELAY=400
CONCURRENT_REQUESTS=4
```

### 2. Создать PostgreSQL

**В Amvera:**

1. Services → PostgreSQL
2. Выбрать версию (14+)
3. Подождать развертывания (2-3 минуты)
4. Скопировать **DATABASE_URL**
5. Вставить в Environment variables приложения

### 3. Развернуть код

**Если используете Git:**

```bash
git push origin main
```

Amvera автоматически развернет приложение.

**Результат:**
```
✅ Приложение развернуто
✅ PostgreSQL подключена
✅ Cron активирован
✅ API доступен на https://your-app.amvera.app
```

---

## Проверка после развертывания

### 1. Проверить здоровье сервера

```bash
curl https://your-app.amvera.app/api/health
```

Ответ:
```json
{
  "status": "ok",
  "timestamp": "2025-10-30T00:15:00.000Z",
  "activeSessions": 0
}
```

### 2. Проверить БД

```bash
curl https://your-app.amvera.app/api/db/overview
```

Ответ:
```json
{
  "total": 0,
  "regionsCount": 0,
  "sellersCount": 0,
  "avgPrice": 0,
  "minPrice": 0,
  "maxPrice": 0,
  "lastUpdate": null
}
```

### 3. Открыть веб-интерфейс

Перейти на: `https://your-app.amvera.app`

Должна открыться главная страница парсера.

---

## Проверка Cron запуска

### Способ 1: Просмотр логов

**В интерфейсе Amvera:**

1. Services → Your App
2. **Logs** tab
3. Фильтр: `CRON`

Должны быть записи:
```
🤖 CRON-ПАРСИНГ ЗАПУЩЕН: 2025-10-30T00:01:00.000Z
📌 Сессия: session_...
📊 Параметры: цена 0-10000000, ...
✅ Парсинг завершен: 5432 объявлений
```

### Способ 2: Запустить вручную (для тестирования)

Отправить POST на эндпоинт (если нужно быстро протестировать):

```bash
curl -X POST https://your-app.amvera.app/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "minPrice": 0,
    "maxPrice": 10000000,
    "maxPages": 10,
    "mode": "live"
  }'
```

**Но обычно этого не нужно** — парсер работает по расписанию.

---

## Мониторинг и статистика

### Просмотр данных из БД

**В браузере:**

1. Перейти на `https://your-app.amvera.app`
2. Нажать кнопку **"📥 Загрузить из БД"**
3. Должны загрузиться данные:
   - 📊 Обзор (статистика)
   - 📋 Данные (таблица со всеми номерами)
   - 🌍 По регионам (группировка)

### Экспорт данных

Нажать кнопку **"📥 Экспортировать"** → скачается файл `autonomera_export_YYYY-MM-DD.xlsx`

---

## Расширенная конфигурация

### Изменить время запуска cron

Переменная: `CRON_TIME`

Примеры:
```
1 0 * * *      # 00:01 (по умолчанию)
0 0 * * *      # 00:00
0 */6 * * *    # каждые 6 часов
0 0,12 * * *   # 00:00 и 12:00
```

### Изменить количество страниц для парсинга

Переменная: `MAX_PAGES`

Примеры:
```
100    # ~5000 объявлений
50     # ~2500 объявлений
200    # ~10000 объявлений
```

### Изменить таймзону cron

Переменная: `PARSER_TIMEZONE`

Примеры:
```
Europe/Moscow        # MSK (по умолчанию)
Europe/London        # GMT
America/New_York     # EST
Asia/Tokyo          # JST
UTC                 # UTC
```

---

## Отладка проблем

### Проблема: "БД недоступна"

**Решение:**
1. Проверить `DATABASE_URL` в Environment variables
2. Убедиться, что PostgreSQL сервис запущен (в Services)
3. Проверить `DB_SSL=true`

### Проблема: "Parsingfailed"

**Решение:**
1. Проверить логи на ошибки
2. Увеличить `REQUEST_TIMEOUT` до 20000
3. Уменьшить `MAX_PAGES` до 50

### Проблема: "Timeout при загрузке из БД"

**Решение:**
1. Уменьшить `limit` в API запросе: `/api/db/data?limit=1000`
2. Проверить производительность БД
3. Добавить индексы в БД

### Проблема: "Cron не запускается"

**Решение:**
1. Проверить `CRON_ENABLED=true`
2. Проверить формат `CRON_TIME` (должен быть `1 0 * * *`)
3. Проверить `PARSER_TIMEZONE` (должна быть валидная)
4. Перезагрузить приложение (Restart)

---

## Масштабирование

### Если данных > 100K объявлений

1. **Увеличить объем БД:**
   - В Amvera: Services → PostgreSQL → Upgrade
   - Выбрать больший размер

2. **Использовать большой limit:**
   ```
   GET /api/db/data?limit=50000
   ```

3. **Добавить индексы:**
   ```sql
   CREATE INDEX idx_listings_region_price ON listings(region, price);
   CREATE INDEX idx_listing_history_number ON listing_history(number);
   ```

### Если парсинг медленный

1. Уменьшить `REQUEST_DELAY` до 200ms
2. Увеличить `CONCURRENT_REQUESTS` до 8
3. Уменьшить `MAX_PAGES` (парсить меньше, но чаще)

---

## Резервная копия данных

### Экспортировать из БД

**Вариант 1: Через API**

```bash
curl https://your-app.amvera.app/api/db/export > backup.xlsx
```

**Вариант 2: Через pg_dump (если у вас доступ)**

```bash
pg_dump $DATABASE_URL > backup.sql
```

### Восстановить данные

```bash
psql $DATABASE_URL < backup.sql
```

---

## Примеры интеграции с другими сервисами

### Telegram Уведомление (когда завершен парсинг)

Добавить в `runCronParsing()` в `server.js`:

```javascript
// После успешного парсинга
const message = `✅ Парсинг завершен!
Новых: ${newCount}
Обновлено: ${updatedCount}
Всего в БД: ${parser.listings.length}`;

// Отправить в Telegram (требует бота)
fetch('https://api.telegram.org/botTOKEN/sendMessage', {
  method: 'POST',
  json: { chat_id: 'YOUR_CHAT_ID', text: message }
});
```

### Google Sheets интеграция

Можно экспортировать данные в Google Sheets через API.

### Slack интеграция

Отправлять уведомления в Slack канал о завершении парсинга.

---

## Полезные команды Amvera CLI

```bash
# Просмотр логов
amvera logs -f

# Перезагрузить приложение
amvera restart

# Просмотреть переменные окружения
amvera env:list

# Установить переменную
amvera env:set CRON_TIME="1 0 * * *"

# Просмотр метрик
amvera metrics
```

---

## Контроль затрат

### Оптимизация для Amvera

1. **Уменьшить парсинг:**
   - `MAX_PAGES=50` вместо `200`
   - `CRON_TIME=0 2 * * 0` (парсить только по воскресеньям)

2. **Уменьшить БД:**
   - Удалять старые данные > 60 дней
   - Архивировать историю

3. **Мониторить затраты:**
   - В Amvera интерфейсе → Billing
   - Установить alert на превышение бюджета

---

## Финальный чек-лист

- [ ] PostgreSQL создана в Amvera
- [ ] DATABASE_URL установлена в Environment
- [ ] CRON_ENABLED=true
- [ ] Код залит на GitHub и развернут
- [ ] Приложение доступно по HTTPS
- [ ] /api/health возвращает 200
- [ ] /api/db/overview возвращает данные
- [ ] Веб-интерфейс загружается
- [ ] Кнопка "Загрузить из БД" работает
- [ ] В таблице видны данные
- [ ] Экспорт в XLSX работает
- [ ] Проверены логи (нет ошибок)

---

## Дополнительная помощь

- [SMART_DAILY_PARSING.md](./SMART_DAILY_PARSING.md) — архитектура системы
- [API_REFERENCE.md](./API_REFERENCE.md) — полный API
- [DATABASE_SETUP.md](./DATABASE_SETUP.md) — настройка БД

**Telegram Support:** @bot_autonomera (если требуется)

---

Последнее обновление: октябрь 2025
