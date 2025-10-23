# Примеры использования парсера АВТОНОМЕРА777

## Быстрый старт

### 1. Веб-интерфейс (самый простой способ)

```bash
node server.js
```

Откройте браузер: http://localhost:3000

## Примеры API запросов

### Пример 1: Парсинг всех номеров

```bash
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "minPrice": 0,
    "maxPrice": 999999999,
    "region": null,
    "maxPages": 50,
    "delayMs": 1000
  }'
```

**Ответ:**
```json
{
  "sessionId": "session_1729619582000_abc12345",
  "status": "started",
  "message": "Парсинг начался"
}
```

### Пример 2: Парсинг номеров Москвы дешевле 500k

```bash
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "minPrice": 0,
    "maxPrice": 500000,
    "region": "77",
    "maxPages": 10,
    "delayMs": 500
  }'
```

### Пример 3: Получить статус парсинга

```bash
curl http://localhost:3000/api/sessions/session_1729619582000_abc12345/status
```

**Ответ:**
```json
{
  "sessionId": "session_1729619582000_abc12345",
  "status": "completed",
  "progress": 100,
  "listingsCount": 247,
  "startTime": "2025-10-22T15:30:00.000Z",
  "duration": "45s"
}
```

### Пример 4: Получить статистику

```bash
curl http://localhost:3000/api/stats/session_1729619582000_abc12345
```

**Ответ:**
```json
{
  "totalListings": 247,
  "avgPrice": 285000,
  "minPrice": 45000,
  "maxPrice": 800000,
  "uniqueRegions": 15,
  "uniqueSellers": 89,
  "regions": ["77", "50", "78", "199", "72", ...],
  "stats": {
    "priceRange": "₽45 000 - ₽800 000",
    "avgPriceFormatted": "₽285 000"
  }
}
```

### Пример 5: Скачать данные в CSV

```bash
curl http://localhost:3000/api/sessions/session_1729619582000_abc12345/export?format=csv \
  -o autonomera777.csv
```

### Пример 6: Скачать данные в JSON

```bash
curl http://localhost:3000/api/sessions/session_1729619582000_abc12345/export?format=json \
  -o autonomera777.json
```

### Пример 7: Список всех активных сессий

```bash
curl http://localhost:3000/api/sessions
```

**Ответ:**
```json
{
  "activeSessions": [
    {
      "sessionId": "session_1729619582000_abc12345",
      "status": "completed",
      "listingsCount": 247,
      "startTime": "2025-10-22T15:30:00.000Z"
    },
    {
      "sessionId": "session_1729619586000_xyz98765",
      "status": "running",
      "listingsCount": 52,
      "startTime": "2025-10-22T15:35:00.000Z"
    }
  ],
  "total": 2
}
```

### Пример 8: Удалить сессию

```bash
curl -X DELETE http://localhost:3000/api/sessions/session_1729619582000_abc12345
```

**Ответ:**
```json
{
  "message": "Сессия удалена"
}
```

## JavaScript примеры

### Пример: Парсинг через Node.js скрипт

```javascript
// Файл: parse_and_analyze.js
const AutonomeraParser = require('./parser');

async function main() {
  // Создаем парсер с параметрами
  const parser = new AutonomeraParser({
    minPrice: 0,
    maxPrice: 500000,
    region: '77', // Только Москва
    maxPages: 20,
    delayMs: 1000
  });

  try {
    // Запускаем парсинг
    const listings = await parser.parse();

    // Выводим статистику
    parser.printStats();

    // Сохраняем результаты
    const csvFile = parser.saveToCSV('moscow_cheap_numbers.csv');
    const jsonFile = parser.saveToJSON('moscow_cheap_numbers.json');

    console.log(`\n✅ Данные сохранены:`);
    console.log(`   CSV: ${csvFile}`);
    console.log(`   JSON: ${jsonFile}`);

    // Примеры анализа данных
    const prices = listings.map(l => l.price);
    const avgPrice = prices.reduce((a, b) => a + b) / prices.length;

    console.log(`\n📊 Анализ:`);
    console.log(`   Самый дешевый номер: ₽${Math.min(...prices)}`);
    console.log(`   Самый дорогой номер: ₽${Math.max(...prices)}`);
    console.log(`   Средняя цена: ₽${Math.round(avgPrice)}`);

  } catch (error) {
    console.error('Ошибка:', error);
  }
}

main();
```

Запуск:
```bash
node parse_and_analyze.js
```

### Пример: Поиск дешевых номеров

```javascript
const AutonomeraParser = require('./parser');

async function findCheapNumbers() {
  const parser = new AutonomeraParser({
    minPrice: 0,
    maxPrice: 100000, // Ищем очень дешевые
    maxPages: 10,
    delayMs: 500
  });

  const listings = await parser.parse();

  // Сортируем по цене
  const sorted = listings.sort((a, b) => a.price - b.price);

  console.log('Топ-10 дешевых номеров:');
  sorted.slice(0, 10).forEach((item, i) => {
    console.log(`${i + 1}. ${item.number} - ₽${item.price.toLocaleString('ru-RU')}`);
  });
}

findCheapNumbers();
```

### Пример: Отслеживание популярных номеров

```javascript
const AutonomeraParser = require('./parser');

async function analyzePopularNumbers() {
  const parser = new AutonomeraParser({
    maxPages: 20,
    delayMs: 1000
  });

  const listings = await parser.parse();

  // Подсчитываем, сколько каждой буквы в начале
  const letterFreq = {};
  listings.forEach(item => {
    const firstLetter = item.number.charAt(0);
    letterFreq[firstLetter] = (letterFreq[firstLetter] || 0) + 1;
  });

  // Сортируем по популярности
  const sorted = Object.entries(letterFreq)
    .sort((a, b) => b[1] - a[1]);

  console.log('Популярные буквы в номерах:');
  sorted.forEach(([letter, count]) => {
    const percentage = ((count / listings.length) * 100).toFixed(1);
    console.log(`${letter}: ${count} номеров (${percentage}%)`);
  });
}

analyzePopularNumbers();
```

## Примеры использования веб-интерфейса

### Сценарий 1: Полный анализ рынка

1. Откройте http://localhost:3000
2. Оставьте все параметры по умолчанию
3. Нажмите "Начать парсинг"
4. Дождитесь завершения
5. Посмотрите "Обзор" для статистики
6. Перейдите на "По регионам" для распределения
7. Экспортируйте CSV

### Сценарий 2: Поиск по одному регионуюю

1. Установите "Регион": `78` (Санкт-Петербург)
2. Установите "Максимум страниц": `5`
3. Нажмите "Начать парсинг"
4. На вкладке "Данные" используйте "Поиск"
5. Отфильтруйте по цене используя CSV

### Сценарий 3: Мониторинг дешевых номеров

1. Установите "Максимальная цена": `150000`
2. Установите "Задержка": `2000` мс
3. Нажмите "Начать парсинг"
4. На вкладке "Данные" нажмите "Применить"
5. Скопируйте интересующие номера

## Bash скрипт для автоматического парсинга (Linux/Mac)

```bash
#!/bin/bash
# Файл: daily_parse.sh

curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "minPrice": 0,
    "maxPrice": 999999999,
    "region": null,
    "maxPages": 50,
    "delayMs": 1000
  }' > session.json

SESSION_ID=$(jq -r '.sessionId' session.json)

echo "Парсинг начался: $SESSION_ID"

# Ждем завершения
while true; do
  STATUS=$(curl -s http://localhost:3000/api/sessions/$SESSION_ID/status)
  STATE=$(echo $STATUS | jq -r '.status')
  COUNT=$(echo $STATUS | jq -r '.listingsCount')

  echo "Статус: $STATE, объявлений: $COUNT"

  if [ "$STATE" = "completed" ]; then
    break
  fi

  sleep 5
done

# Скачиваем результаты
curl http://localhost:3000/api/sessions/$SESSION_ID/export?format=csv \
  -o "autonomera777_$(date +%Y-%m-%d).csv"

echo "Парсинг завершен!"
```

---

**Больше примеров можно найти в README.md и встроенной документации API**
