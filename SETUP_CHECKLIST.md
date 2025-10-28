# ✅ ЧЕКЛИСТ УСТАНОВКИ И ЗАПУСКА

Пошаговая инструкция для полной подготовки системы.

---

## 🔧 ПОДГОТОВКА ОКРУЖЕНИЯ

### ✅ Шаг 1: Проверьте Node.js

```bash
node --version    # Должно быть 14.0.0 или выше
npm --version     # Должно быть 6.0.0 или выше
```

**Если нет:**
- Скачайте и установите с https://nodejs.org/

---

### ✅ Шаг 2: Проверьте MySQL

```bash
mysql --version   # Должна быть версия 5.7+ или MariaDB 10.3+
```

**Если не установлен:**

**Windows:**
1. Скачайте MySQL Community Server с https://dev.mysql.com/downloads/
2. Установите с пароль для `root` пользователя
3. Запустите MySQL Command Line Client или используйте MySQL Workbench

**Linux:**
```bash
sudo apt-get update
sudo apt-get install mysql-server
sudo systemctl start mysql
```

**Mac:**
```bash
brew install mysql
brew services start mysql
```

---

### ✅ Шаг 3: Запустите MySQL сервис

**Windows:**
1. Откройте Services (Win+R → services.msc)
2. Найдите "MySQL80" (или похожее)
3. Убедитесь, что статус "Running"

**Linux/Mac:**
```bash
# Linux
sudo systemctl start mysql

# Mac
brew services start mysql
```

---

## 🗄️ НАСТРОЙКА БД

### ✅ Шаг 4: Создайте базу данных

Откройте MySQL:

```bash
mysql -u root -p
```

Введите пароль MySQL.

Выполните:

```sql
CREATE DATABASE autonomera777;
EXIT;
```

**Проверка:**
```bash
mysql -u root -p -e "SHOW DATABASES;" | grep autonomera777
```

---

## 💾 НАСТРОЙКА ПРИЛОЖЕНИЯ

### ✅ Шаг 5: Отредактируйте .env файл

Откройте `.env` в корне проекта:

```env
# Server
PORT=3000
NODE_ENV=development

# Database - ОБЯЗАТЕЛЬНО!
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD_HERE  # ← ИЗМЕНИТЕ ЭТО!
DB_NAME=autonomera777

# Parser
PARSER_TIME=00:00
PARSER_TIMEZONE=Europe/Moscow
MAX_PAGES=50
CONCURRENT_REQUESTS=500
REQUEST_DELAY=1000
```

**Что заменить:**
- `DB_PASSWORD` → ваш пароль MySQL для пользователя `root`

---

### ✅ Шаг 6: Установите зависимости

```bash
npm install
```

**Должны установиться:**
- ✓ mysql2 (для БД)
- ✓ node-cron (для расписания)
- ✓ Остальные зависимости парсера

**Проверка:**
```bash
npm list mysql2 node-cron
```

---

## 🚀 ЗАПУСК СИСТЕМЫ

### ✅ Шаг 7: Запустите сервер

```bash
npm start
```

**Вы должны увидеть (в порядке):**

```
🗄️  ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
===================================================
✓ База данных подключена успешно
✓ Таблицы созданы/проверены

📅 ИНИЦИАЛИЗАЦИЯ ПЛАНИРОВЩИКА
===================================================
⏰ Время запуска: 00:00
🌍 Часовой пояс: Europe/Moscow
✅ Планировщик инициализирован и запущен

🚀 API сервер запущен на http://0.0.0.0:3000
✅ СИСТЕМА ГОТОВА К РАБОТЕ
```

**Если ошибка:**
- Проверьте пароль MySQL в `.env`
- Проверьте, что MySQL запущен
- Проверьте, что БД создана
- Посмотрите полное сообщение об ошибке

---

## ✅ ПРОВЕРКА РАБОТОСПОСОБНОСТИ

### ✅ Шаг 8: Откройте браузер

```
http://localhost:3000
```

Вы должны увидеть **главную страницу** с описанием и кнопками.

### ✅ Шаг 9: Проверьте статус БД

Откройте в браузере или консоли:

```bash
curl http://localhost:3000/api/db/status
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "database": {
    "connected": true,
    "host": "localhost",
    "database": "autonomera777",
    "listingsCount": 0,
    "completedSessions": 0
  }
}
```

### ✅ Шаг 10: Проверьте планировщик

Посмотрите логи сервера - должно быть:
```
ℹ️  Планировщик: АКТИВЕН
```

---

## 🧪 ТЕСТИРОВАНИЕ

### ✅ Шаг 11: Запустите парсинг вручную

**Способ 1 (веб):**
```
http://localhost:3000/run
```

**Способ 2 (API):**
```bash
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 5, "minPrice": 0, "maxPrice": 500000}'
```

Парсер должен начать собирать данные.

### ✅ Шаг 12: Проверьте сохранение данных

После завершения парсинга:

```bash
curl http://localhost:3000/api/statistics
```

**Должно быть:**
```json
{
  "statistics": {
    "total": 50,        // Кол-во собранных объявлений
    "avgPrice": 300000,
    "minPrice": 50000,
    "maxPrice": 500000
  }
}
```

### ✅ Шаг 13: Проверьте таблицы БД

Откройте MySQL:

```bash
mysql -u root -p autonomera777
```

Выполните:

```sql
-- Посмотреть сколько объявлений
SELECT COUNT(*) FROM listings;

-- Посмотреть несколько записей
SELECT number, price, region FROM listings LIMIT 5;

-- Посмотреть сессии парсинга
SELECT id, status, totalItems FROM parse_sessions;

-- Выйти
EXIT;
```

---

## 📅 ПРОВЕРКА АВТОМАТИЧЕСКОГО ОБНОВЛЕНИЯ

### ✅ Шаг 14: Убедитесь, что планировщик работает

**Сейчас должно быть:**
- ✓ Планировщик инициализирован
- ✓ Следующий запуск: сегодня в 00:00

**Через день:**
- ✓ Парсер автоматически запустится в 00:00
- ✓ Данные обновятся в БД
- ✓ Логи запишутся в `cron_logs`

**Проверить логи:**
```bash
curl http://localhost:3000/api/cron-logs
```

---

## 🎯 ФИНАЛЬНАЯ ПРОВЕРКА

### Все готово, если:

- [x] MySQL запущен и БД `autonomera777` создана
- [x] `.env` файл отредактирован с корректным паролем
- [x] `npm install` выполнен без ошибок
- [x] `npm start` запустился успешно
- [x] http://localhost:3000 открывается в браузере
- [x] `/api/db/status` показывает `connected: true`
- [x] Парсинг можно запустить через `/run`
- [x] Данные сохраняются в БД
- [x] Таблицы созданы в MySQL
- [x] Планировщик активирован

---

## 📊 Основные команды

### Для разработки

```bash
# Запустить сервер
npm start

# Установить зависимости
npm install

# Проверить здоровье
curl http://localhost:3000/api/health

# Посмотреть все данные
curl http://localhost:3000/api/data

# Посмотреть статистику
curl http://localhost:3000/api/statistics
```

### Для MySQL

```bash
# Подключиться к БД
mysql -u root -p autonomera777

# Посмотреть таблицы
SHOW TABLES;

# Посчитать объявления
SELECT COUNT(*) FROM listings;

# Посмотреть последнее обновление
SELECT * FROM cron_logs ORDER BY startedAt DESC LIMIT 1;
```

---

## 🆘 РЕШЕНИЕ ПРОБЛЕМ

### Проблема: "ECONNREFUSED 127.0.0.1:3306"

**Причина:** MySQL не запущен

**Решение:**
```bash
# Windows: откройте Services и запустите MySQL80

# Linux:
sudo systemctl start mysql

# Mac:
brew services start mysql
```

---

### Проблема: "Unknown database 'autonomera777'"

**Причина:** БД не создана

**Решение:**
```bash
mysql -u root -p -e "CREATE DATABASE autonomera777;"
```

---

### Проблема: "Access denied for user 'root'"

**Причина:** Неправильный пароль в `.env`

**Решение:**
1. Откройте `.env`
2. Убедитесь, что `DB_PASSWORD` совпадает с вашим паролем MySQL
3. Перезагрузите сервер

---

### Проблема: "Парсинг не запускается автоматически"

**Причина:** Возможны ошибки в конфигурации

**Решение:**
1. Проверьте `PARSER_TIME` в `.env` (формат: HH:MM)
2. Проверьте логи сервера при инициализации
3. Проверьте, что MySQL работает
4. Перезагрузите сервер

---

### Проблема: Данные не сохраняются в БД

**Причина:** Ошибка при сохранении

**Решение:**
1. Проверьте логи сервера на ошибки БД
2. Убедитесь, что таблицы созданы
3. Проверьте права доступа `DB_USER`
4. Посмотрите `SELECT COUNT(*) FROM listings;`

---

## 📞 Если всё ещё не работает

1. **Смотрите документацию:**
   - `DATABASE_SETUP.md` - полное руководство
   - `QUICK_DB_START.md` - быстрый старт

2. **Проверьте логи:**
   ```bash
   curl http://localhost:3000/api/db/status
   curl http://localhost:3000/api/cron-logs
   ```

3. **Проверьте БД:**
   ```bash
   mysql -u root -p autonomera777
   SHOW TABLES;
   SELECT COUNT(*) FROM listings;
   ```

---

## ✨ ПОЗДРАВЛЯЕМ!

Если вы прошли все шаги, система полностью настроена и готова к работе! 🎉

**Дальше:**
1. Парсер будет автоматически обновляться каждый день в 00:00
2. Данные сохраняются в MySQL БД
3. API доступен для программного доступа
4. Вы можете экспортировать данные в CSV/JSON

---

**Начните использовать систему:**
- Откройте http://localhost:3000
- Запустите парсинг
- Смотрите результаты в `/api/data`
- Проверяйте статистику в `/api/statistics`

🚀 **Готово!**
