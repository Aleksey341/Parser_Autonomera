# ⚡ Быстрый старт: Парсер с БД MySQL

Пошаговое руководство за 5 минут! 🚀

---

## Шаг 1️⃣: Убедитесь, что MySQL запущен

```bash
# Windows
# Откройте Services (services.msc) и запустите MySQL80

# Linux
sudo systemctl start mysql

# Mac
brew services start mysql
```

---

## Шаг 2️⃣: Создайте базу данных

Откройте MySQL и выполните:

```bash
# Вход в MySQL
mysql -u root -p

# SQL команды
CREATE DATABASE autonomera777;
EXIT;
```

---

## Шаг 3️⃣: Настройте .env файл

Отредактируйте файл `.env` в корне проекта:

```env
# Database - ОБЯЗАТЕЛЬНО измените пароль!
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=ВАШ_ПАРОЛЬ_MYSQL    # ← Измените это!
DB_NAME=autonomera777

# Время автоматического парсинга
PARSER_TIME=00:00               # Ежедневно в полночь
PARSER_TIMEZONE=Europe/Moscow

# Параметры парсинга
MAX_PAGES=50
MAX_PRICE=999999999
CONCURRENT_REQUESTS=500
```

---

## Шаг 4️⃣: Установите зависимости и запустите

```bash
# Установка
npm install

# Запуск сервера
npm start
```

**Вы должны увидеть:**

```
✓ База данных подключена успешно
✓ Таблицы созданы/проверены
📅 Планировщик инициализирован и запущен
🚀 API сервер запущен на http://0.0.0.0:3000
✅ СИСТЕМА ГОТОВА К РАБОТЕ
```

---

## Шаг 5️⃣: Проверьте, что всё работает

Откройте браузер и перейдите на:

```
http://localhost:3000
```

Вы должны увидеть главную страницу с кнопками для парсинга.

---

## 📊 Как это работает

```
1. ЗАПУСК ПАРСИНГА
   ↓
2. ПАРСЕР СОБИРАЕТ ДАННЫЕ
   ↓
3. ДАННЫЕ СОХРАНЯЮТСЯ В MySQL
   ↓
4. ДАННЫЕ ДОСТУПНЫ ВИА API
   ↓
5. КАЖДЫЙ ДЕНЬ В 00:00 - АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ⏰
```

---

## 🔑 Главные Endpoints

| URL | Описание |
|-----|---------|
| `http://localhost:3000` | Главная страница |
| `http://localhost:3000/run` | Запустить парсинг |
| `/api/data` | Все данные из БД |
| `/api/statistics` | Статистика |
| `/api/export?format=csv` | Скачать CSV |
| `/api/db/status` | Статус БД |

---

## 🔍 Проверка статуса

```bash
# Посмотрите статистику
curl http://localhost:3000/api/statistics

# Проверьте статус БД
curl http://localhost:3000/api/db/status

# Посмотрите логи обновлений
curl http://localhost:3000/api/cron-logs
```

---

## ❌ Если что-то не работает

### Ошибка: "ECONNREFUSED"
MySQL не запущен. Запустите сервис MySQL.

### Ошибка: "Unknown database"
Вы забыли создать БД. Выполните:
```bash
mysql -u root -p -e "CREATE DATABASE autonomera777;"
```

### Ошибка: "Access denied"
Проверьте пароль в `.env` файле. Он должен совпадать с паролем MySQL.

### Парсинг не запускается
1. Проверьте логи сервера
2. Убедитесь, что `PARSER_TIME` в формате HH:MM
3. Проверьте, что MySQL работает

---

## 📅 Расписание обновлений

По умолчанию парсер **автоматически обновляет данные** ежедневно в **00:00** (полночь).

Чтобы изменить время, отредактируйте `.env`:

```env
# В 6:00 утра
PARSER_TIME=06:00

# В 18:00 (6 PM)
PARSER_TIME=18:00

# В 12:00 (полдень)
PARSER_TIME=12:00
```

Затем перезагрузите сервер.

---

## 💾 Резервная копия данных

Если вам нужны данные в файл:

```bash
# CSV экспорт
curl "http://localhost:3000/api/export?format=csv" -o data.csv

# JSON экспорт
curl "http://localhost:3000/api/export?format=json" -o data.json
```

---

## 🎯 Для разработчиков

### Прямое подключение к БД

```javascript
const db = require('./db');

// Получить все данные
const listings = await db.getListings({ limit: 100 });

// Получить статистику
const stats = await db.getListingsStats();

// Вставить данные
await db.insertOrUpdateListing({
  number: 'А123ВХ77',
  price: 250000,
  region: '77',
  status: 'active',
  seller: 'John Doe',
  url: 'https://...'
});
```

### Запуск парсера вручную

```javascript
const { scheduledParseTask } = require('./parser-db');

// Запустить парсинг вручную
await scheduledParseTask();
```

---

## 📚 Подробная документация

Для полной информации смотрите `DATABASE_SETUP.md`

---

## ✨ Готово!

Ваша система готова к работе! 🎉

- ✅ MySQL БД подключена
- ✅ Парсер сохраняет данные в БД
- ✅ Ежедневные автоматические обновления запущены
- ✅ API доступен на http://localhost:3000

Начните с:
1. Откройте http://localhost:3000/run чтобы начать парсинг
2. Проверьте `/api/data` чтобы увидеть результаты
3. Система будет обновляться автоматически каждый день!

---

**Нужна помощь?** Смотрите `DATABASE_SETUP.md` для подробного руководства 📖
