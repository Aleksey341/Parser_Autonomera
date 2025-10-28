#!/bin/bash

# API ПРИМЕРЫ И ТЕСТИРОВАНИЕ
# Используйте эти команды для тестирования системы

# ============================================
# 0. ПРОВЕРКА СТАТУСА
# ============================================

echo "=== Проверка здоровья сервера ==="
curl http://localhost:3000/api/health

echo -e "\n=== Статус БД ==="
curl http://localhost:3000/api/db/status

# ============================================
# 1. ПОЛУЧЕНИЕ ДАННЫХ
# ============================================

echo -e "\n=== Все объявления (первые 10) ==="
curl "http://localhost:3000/api/data?limit=10"

echo -e "\n=== Объявления в диапазоне цены ==="
curl "http://localhost:3000/api/data?minPrice=100000&maxPrice=500000&limit=20"

echo -e "\n=== Объявления по регионам ==="
curl "http://localhost:3000/api/data?region=77&limit=10"

# ============================================
# 2. СТАТИСТИКА
# ============================================

echo -e "\n=== Статистика по всем данным ==="
curl http://localhost:3000/api/statistics

# ============================================
# 3. ИСТОРИЯ ПАРСИНГА
# ============================================

echo -e "\n=== Все сессии парсинга ==="
curl http://localhost:3000/api/parse-sessions

echo -e "\n=== Логи автообновлений (последние 10) ==="
curl http://localhost:3000/api/cron-logs

# ============================================
# 4. ЭКСПОРТ ДАННЫХ
# ============================================

echo -e "\n=== Скачать CSV ==="
echo "Команда:"
echo 'curl "http://localhost:3000/api/export?format=csv" -o autonomera777.csv'

echo -e "\n=== Скачать JSON ==="
echo "Команда:"
echo 'curl "http://localhost:3000/api/export?format=json" -o autonomera777.json'

# ============================================
# 5. ЗАПУСК ПАРСИНГА
# ============================================

echo -e "\n=== Запустить парсинг вручную ==="
echo "Через браузер:"
echo "http://localhost:3000/run"

echo -e "\nЧерез API:"
echo 'curl -X POST http://localhost:3000/api/parse \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{\"minPrice\": 0, \"maxPrice\": 500000, \"maxPages\": 10}"'

# ============================================
# 6. УПРАВЛЕНИЕ ДАННЫМИ
# ============================================

echo -e "\n=== Удалить данные старше 30 дней ==="
echo 'curl -X DELETE "http://localhost:3000/api/data/old?days=30"'

echo -e "\n=== Очистить всю БД (только dev) ==="
echo 'curl -X DELETE http://localhost:3000/api/data/clear'

# ============================================
# 7. ПРИМЕРЫ ПОЛНЫХ ЗАПРОСОВ
# ============================================

echo -e "\n\n=== ПРИМЕРЫ ПОЛНЫХ ЗАПРОСОВ (копируйте и запускайте) ==="

echo -e "\n--- Получить все объявления от 100k до 500k в Москве ---"
echo 'curl "http://localhost:3000/api/data?minPrice=100000&maxPrice=500000&region=77"'

echo -e "\n--- Получить объявления и вывести формат ---"
echo 'curl -s "http://localhost:3000/api/data?limit=1" | jq'

echo -e "\n--- Получить статистику красивым форматом ---"
echo 'curl -s http://localhost:3000/api/statistics | jq ".statistics"'

echo -e "\n--- Проверить количество объявлений в БД ---"
echo 'curl -s http://localhost:3000/api/statistics | jq ".statistics.total"'

echo -e "\n--- Скачать CSV с фильтром ---"
echo 'curl "http://localhost:3000/api/export?format=csv&minPrice=50000&maxPrice=1000000" \\'
echo '  -o listings_filtered.csv'

echo -e "\n--- Проверить последнее обновление ---"
echo 'curl -s http://localhost:3000/api/cron-logs | jq ".[0]"'

# ============================================
# 8. JAVASCRIPT ПРИМЕРЫ
# ============================================

cat > /tmp/api_test.js << 'EOF'
// Откройте консоль браузера и вставьте эти команды

// 1. Получить статистику
fetch('/api/statistics')
  .then(r => r.json())
  .then(d => console.log('Статистика:', d.statistics))

// 2. Получить первые 100 объявлений
fetch('/api/data?limit=100')
  .then(r => r.json())
  .then(d => {
    console.log(`Всего объявлений: ${d.count}`);
    d.data.forEach(item => {
      console.log(`${item.number} - ${item.price}₽ (${item.region})`);
    });
  })

// 3. Получить объявления с фильтром
fetch('/api/data?minPrice=100000&maxPrice=500000')
  .then(r => r.json())
  .then(d => console.log(`Объявлений в диапазоне: ${d.count}`))

// 4. Скачать CSV
const downloadCSV = async () => {
  const response = await fetch('/api/export?format=csv');
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'autonomera777.csv';
  a.click();
}
downloadCSV();

// 5. Посмотреть логи
fetch('/api/cron-logs')
  .then(r => r.json())
  .then(d => console.log('Последние обновления:', d.logs.slice(0, 5)))
EOF

echo -e "\n--- JavaScript код (в консоли браузера) ---"
cat /tmp/api_test.js

# ============================================
# 9. PYTHON ПРИМЕРЫ
# ============================================

cat > /tmp/api_test.py << 'EOF'
#!/usr/bin/env python3
import requests
import json

BASE_URL = 'http://localhost:3000/api'

# 1. Проверить статус
print("=== Статус БД ===")
response = requests.get(f'{BASE_URL}/db/status')
print(json.dumps(response.json(), indent=2, ensure_ascii=False))

# 2. Получить статистику
print("\n=== Статистика ===")
response = requests.get(f'{BASE_URL}/statistics')
stats = response.json()['statistics']
print(f"Всего объявлений: {stats['total']}")
print(f"Средняя цена: {stats['avgPrice']:,} ₽")
print(f"Диапазон цен: {stats['minPrice']:,} - {stats['maxPrice']:,} ₽")
print(f"Регионов: {stats['regionsCount']}")
print(f"Продавцов: {stats['sellersCount']}")

# 3. Получить данные
print("\n=== Первые 5 объявлений ===")
response = requests.get(f'{BASE_URL}/data?limit=5')
data = response.json()
for item in data['data']:
    print(f"  {item['number']} - {item['price']}₽ ({item['region']})")

# 4. Фильтрованные данные
print("\n=== Объявления от 100k до 500k ===")
response = requests.get(f'{BASE_URL}/data?minPrice=100000&maxPrice=500000&limit=10')
data = response.json()
print(f"Найдено: {data['count']}")

# 5. Получить логи
print("\n=== Последние обновления ===")
response = requests.get(f'{BASE_URL}/cron-logs')
logs = response.json()['logs'][:3]
for log in logs:
    print(f"  {log['startedAt']} - {log['status']} ({log['itemsProcessed']} объявлений)")
EOF

echo -e "\n--- Python код (запустите python3 api_test.py) ---"
cat /tmp/api_test.py

# ============================================
# КОНЕЦ
# ============================================

echo -e "\n\n=== Все примеры показаны ==="
echo "Сохранены в:"
echo "  - /tmp/api_test.js (JavaScript)"
echo "  - /tmp/api_test.py (Python)"
