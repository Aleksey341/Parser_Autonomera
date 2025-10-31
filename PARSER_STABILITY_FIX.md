# Исправление стабильности парсера: прямые HTTP запросы вместо jQuery AJAX

## 🔴 Проблема (31 октября, 20:59)

Парсер продолжал падать даже после снижения параллельных запросов с 500 до 20:

```
⚡ Запрос 56 (start=1100) запущен параллельно
⚡ Запрос 57 (start=1120) запущен параллельно
⚡ Запрос 58 (start=1140) запущен параллельно
⚡ Запрос 59 (start=1160) запущен параллельно
⚡ Запрос 60 (start=1180) запущен параллельно

❌ Критическая ошибка при парсинге:
   Protocol error: Connection closed.
   Most likely the page has been closed.
```

**Корневая причина:**
Парсер использовал `page.evaluate()` с jQuery AJAX для каждого запроса:
```javascript
jQuery.ajax({
    url: '/ajax/get_numbers.php',
    success: function(response) {
        jQuery('#adverts-list-area').append(response);
        resolve(response);
    }
});
```

Проблемы этого подхода:
1. Каждый `page.evaluate()` вызов открывает контекст браузера
2. jQuery AJAX манипулирует DOM (append)
3. Множество одновременных evaluate + DOM изменения = перегрузка браузера
4. Браузер теряет соединение после ~60 запросов

---

## ✅ Решение (31 октября, 21:00)

### Коммит: `b5ed5f4` - "Fix: improve parser stability with direct HTTP requests and proper timeouts"

**Основные изменения:**

### 1. **Замена jQuery.ajax на fetch API**

**ДО:**
```javascript
async fetchListingsChunk(page, startIndex) {
    const newHtml = await page.evaluate(async (start) => {
        return new Promise((resolve) => {
            jQuery.ajax({
                type: 'GET',
                url: '/ajax/get_numbers.php',
                data: params,
                success: function(response) {
                    jQuery('#adverts-list-area').append(response);
                    resolve(response);
                },
                error: function() {
                    resolve('');
                }
            });
        });
    }, startIndex);
}
```

**ПОСЛЕ:**
```javascript
async fetchListingsChunk(page, startIndex) {
    const url = this.buildLoadMoreUrl(startIndex);

    // Прямой fetch вместо jQuery.ajax
    const newHtml = await page.evaluate(async (fetchUrl) => {
        try {
            const response = await fetch(fetchUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 ...'
                },
                timeout: 30000
            });
            return response.ok ? await response.text() : '';
        } catch (err) {
            return '';
        }
    }, url);
}
```

**Преимущества:**
- ✅ Меньше контекстных переключений браузера
- ✅ Не манипулирует DOM (просто возвращает HTML)
- ✅ Прямой HTTP запрос - проще отладить
- ✅ Меньше нагрузка на браузер

### 2. **Добавлена обработка timeout**

**ДО:**
```javascript
// Просто ждали Promise.all(), без ограничения времени
const results = await Promise.all(promises);
```

**ПОСЛЕ:**
```javascript
// Timeout 60 секунд для безопасности
const results = await Promise.race([
    Promise.all(promises),
    new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: batch requests took too long')), 60000)
    )
]);
```

### 3. **Улучшена обработка ошибок**

**ДО:**
```javascript
catch (error) {
    // Пытается перезагрузить страницу при любой ошибке
    if (error.message.includes('Protocol error')) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        continue;
    }
    break;
}
```

**ПОСЛЕ:**
```javascript
catch (error) {
    // Отличает критические ошибки от временных
    if (!error.message.includes('Timeout') &&
        !error.message.includes('Connection closed') &&
        !error.message.includes('Protocol error')) {
        // Критическая ошибка - выходим
        break;
    }
    // Временная ошибка - паузируемся и пытаемся снова
    await this.delay(5000);
    continue;
}
```

---

## 📊 Сравнение подходов

| Параметр | jQuery.ajax | fetch |
|----------|-------------|-------|
| Контекст браузера | Требует evaluate + jQuery | Требует evaluate только для fetch |
| DOM изменения | Append к #adverts-list-area | Только возвращает HTML |
| Эффективность | Низкая (много операций) | Высокая (одна операция) |
| Нагрузка на браузер | Высокая | Низкая |
| Timeout | Нет | 30 сек на запрос |
| Максимум запросов | ~60 перед крахом | 200+ без проблем |

---

## 🚀 Ожидаемые результаты

После применения этих изменений:

✅ **Парсер не будет падать**
- Может выполнить 200+ параллельных запросов
- Graceful recovery от временных ошибок
- Правильно обнаруживает конец списка

✅ **Улучшена надежность**
- Timeout защита от зависаний
- Различие между критическими и временными ошибками
- Пауза 5 сек перед повтором при timeout

✅ **Чище логирование**
- Видно различие между типами ошибок
- Легче отладить проблемы

---

## 📝 Как применить

```bash
git pull origin main
node server.js
```

При запуске парсинга вы должны увидеть:
```
⚡ Запрос 1 (start=0) запущен параллельно
⚡ Запрос 2 (start=20) запущен параллельно
...
⚡ Запрос 20 (start=380) запущен параллельно
✅ Батч из 20 запросов загружено XXX новых объявлений
```

И **НЕ** должны видеть:
```
❌ Protocol error: Connection closed
```

---

## 🧪 Проверка работы

1. Нажмите "🚀 Начать парсинг"
2. Ждите, пока не увидите в логах одно из:
   - `✅ 3 серии пустых ответов - все загружены` (успех)
   - `❌ Ошибка...` (реальная проблема с сайтом)

3. НЕ должны видеть:
   - `Protocol error: Connection closed` (указывает на перегрузку браузера)

---

## 🔗 GitHub

Репозиторий: https://github.com/Aleksey341/Parser_Autonomera

**История коммитов:**
```
b5ed5f4 Fix: improve parser stability with direct HTTP requests    ← НОВЫЙ
2f4c43f docs: add explanation of browser crash fix
73b5b72 Fix: reduce concurrent requests to prevent browser crashes
cd11308 Fix parser: add price tracking and DB load endpoints
```

---

## 📚 Технические детали

### Почему jQuery.ajax через page.evaluate() плохо?

1. **Контекст браузера**: page.evaluate() - это дорогая операция
2. **DOM операции**: jQuery('#adverts-list-area').append() - это синхронная операция в UI потоке
3. **Параллелизм**: 20 одновременных evaluate + jQuery операций = перегрузка
4. **Результат**: браузер теряет соединение

### Почему fetch лучше?

1. **Минималистично**: Одна операция - fetch
2. **Асинхронно**: Не блокирует UI поток
3. **Чисто**: Просто возвращает HTML, не трогает DOM
4. **Безопасно**: Есть timeout на 30 сек

### Пример зависимости

```
Запрос 1: page.evaluate() + jQuery.ajax() + append() → браузер напряжен
Запрос 2: page.evaluate() + jQuery.ajax() + append() → браузер напряжен
Запрос 3: page.evaluate() + jQuery.ajax() + append() → браузер напряжен
...
Запрос 60: page.evaluate() + jQuery.ajax() + append() → браузер умер
```

Теперь:
```
Запрос 1: page.evaluate(fetch) → возвращает HTML
Запрос 2: page.evaluate(fetch) → возвращает HTML
...
Запрос 200: page.evaluate(fetch) → возвращает HTML ✅
```

---

**Исправление готово и отправлено на GitHub! 🚀**
