// Autonomera777 Parser - Main JavaScript

let allData = [];
let filteredData = [];
let currentSessionId = null;
let statusCheckInterval = null;
let parsingStartTime = null;
let parsingTimerInterval = null;
let foundCount = 0; // Количество найденных объявлений
let isStopped = false; // Был ли парсинг остановлен

// Конфигурация сортировки для регионов
let regionsSortConfig = {
    column: 'region',
    direction: 'asc',
    data: [] // Сохраняем данные регионов для сортировки
};

// Автоматически определяем URL сервера
let serverUrl;
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    serverUrl = 'http://localhost:3000';
} else if (window.location.hostname.includes('amvera')) {
    serverUrl = window.location.protocol + '//' + window.location.host;
} else {
    serverUrl = 'https://parser-autonomera-production.up.railway.app';
}

console.log('🚗 Server URL:', serverUrl);

/**
 * Переводит статус парсинга на русский язык
 */
function translateStatus(status) {
    const translations = {
        'running': '⏳ Выполняется',
        'paused': '⏸️ На паузе',
        'completed': '✅ Завершен',
        'stopped': '🛑 Остановлен',
        'error': '❌ Ошибка',
        'initialization': '🚀 Инициализация'
    };
    return translations[status] || status;
}

async function startParsing() {
    // НОВАЯ ЛОГИКА: Загружаем данные из БД вместо парсинга сайта
    // Парсинг выполняется автоматически по cron каждый день в 00:01

    const minPrice = parseInt(document.getElementById('minPrice').value) || 0;
    const maxPrice = parseInt(document.getElementById('maxPrice').value) || Infinity;

    try {
        const healthCheck = await fetch(`${serverUrl}/api/health`);
        if (!healthCheck.ok) {
            showMessage('error', '❌ Сервер недоступен. Убедитесь, что Node.js сервер запущен на ' + serverUrl);
            return;
        }
    } catch (error) {
        showMessage('error', '❌ Не удалось подключиться к серверу. Запустите: node server.js');
        return;
    }

    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('spinner').style.display = 'inline-block';
    document.getElementById('progressSection').classList.add('active');

    showMessage('info', '📥 Загружаю данные из базы данных...');
    document.getElementById('statusText').textContent = '📥 Загружаю данные из БД...';
    document.getElementById('sessionStatus').textContent = 'Загрузка...';
    document.getElementById('parsingTimer').textContent = '00:00';
    document.getElementById('loadedCount').textContent = '0';
    foundCount = 0;
    document.getElementById('foundCount').textContent = '0';
    isStopped = false;
    currentSessionId = 'db_load_' + Date.now();

    try {
        // Загружаем список запросов параллельно для максимальной скорости
        showMessage('info', '⏳ Загружаю статистику и данные...', 3000);

        const [overviewResp, dataResp, regionsResp] = await Promise.all([
            fetch(`${serverUrl}/api/db/overview`),
            fetch(`${serverUrl}/api/db/data?limit=10000`),
            fetch(`${serverUrl}/api/db/regions`)
        ]);

        if (!overviewResp.ok || !dataResp.ok || !regionsResp.ok) {
            throw new Error('Ошибка загрузки данных из БД');
        }

        const overview = await overviewResp.json();
        const dataResult = await dataResp.json();
        const regionsResult = await regionsResp.json();

        // Обновляем глобальные переменные
        allData = dataResult.rows || [];
        filteredData = [...allData];
        foundCount = allData.length;

        console.log('✅ Данные загружены из БД:');
        console.log(`   - Всего объявлений: ${overview.total}`);
        console.log(`   - Загруженных записей: ${allData.length}`);

        // Обновляем UI
        document.getElementById('sessionStatus').textContent = '✅ Загружено из БД';
        document.getElementById('loadedCount').textContent = allData.length;
        document.getElementById('foundCount').textContent = foundCount;
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString('ru-RU');

        // Показываем статистику
        displayOverview(overview);
        displayData(allData);
        displayRegions(regionsResult.rows || []);
        switchTab('overview');

        showMessage('success', `✅ Данные загружены! ${allData.length} объявлений из БД`);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
        document.getElementById('spinner').style.display = 'none';

    } catch (error) {
        showMessage('error', `❌ Ошибка загрузки: ${error.message}`);
        console.error('Детали ошибки:', error);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('spinner').style.display = 'none';
    }
}

async function monitorParsing() {
    if (!currentSessionId) return;

    // Очищаем старый интервал если он существует
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        console.log('🔄 Старый интервал мониторинга очищен');
    }

    // Создаём новый интервал для мониторинга статуса
    statusCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${serverUrl}/api/sessions/${currentSessionId}/status`);
            const status = await response.json();

            // Переводим статус на русский язык
            document.getElementById('sessionStatus').textContent = translateStatus(status.status);
            document.getElementById('loadedCount').textContent = status.listingsCount;

            // Обновляем счетчик найденных объявлений в реальном времени
            foundCount = status.listingsCount;
            document.getElementById('foundCount').textContent = foundCount;

            // Debug logging
            console.log(`📊 Статус обновлен: ${status.status}, найдено объявлений: ${foundCount}`);

            if (status.status === 'completed') {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                stopParsingTimer();
                // false - заменяем данные (полная загрузка готова)
                await loadResults(false);
                showMessage('success', `✅ Парсинг завершен! Всего загруженно ${status.listingsCount} объявлений`);
                document.getElementById('startBtn').disabled = false;
                document.getElementById('continueBtn').disabled = true;
                document.getElementById('continueBtn').style.display = 'none';
                document.getElementById('resumeBtn').disabled = true;
                document.getElementById('resumeBtn').style.display = 'none';
                document.getElementById('stopBtn').disabled = true;
                document.getElementById('exportBtn').disabled = false;
                document.getElementById('spinner').style.display = 'none';
            } else if (status.status === 'paused') {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                stopParsingTimer();
                // Передаем true для добавления новых данных к существующим (продолжение батча)
                await loadResults(true);
                showMessage('success', `✅ Батч ${status.batch.number || 1} готов! Всего загруженно ${status.listingsCount} объявлений\n👉 Нажмите "Продолжить" для загрузки следующего батча`);
                document.getElementById('startBtn').disabled = true;
                document.getElementById('continueBtn').disabled = false;
                document.getElementById('continueBtn').style.display = 'inline-block';
                document.getElementById('resumeBtn').disabled = true;
                document.getElementById('resumeBtn').style.display = 'none';
                document.getElementById('stopBtn').disabled = false;
                document.getElementById('exportBtn').disabled = false;
                document.getElementById('spinner').style.display = 'none';
            } else if (status.status === 'stopped') {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                stopParsingTimer();
                // true - добавляем к существующим (пользователь остановил, может возобновить)
                await loadResults(true);
                showMessage('success', `✅ Парсинг остановлен! Всего собрано ${status.listingsCount} объявлений`);
                document.getElementById('startBtn').disabled = false;
                document.getElementById('continueBtn').disabled = true;
                document.getElementById('continueBtn').style.display = 'none';
                document.getElementById('stopBtn').disabled = true;
                document.getElementById('exportBtn').disabled = false;
                document.getElementById('spinner').style.display = 'none';
            } else if (status.status === 'error') {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                stopParsingTimer();
                showMessage('error', `❌ Ошибка парсинга: ${status.error}`);
                document.getElementById('startBtn').disabled = false;
                document.getElementById('continueBtn').disabled = true;
                document.getElementById('continueBtn').style.display = 'none';
                document.getElementById('stopBtn').disabled = true;
                document.getElementById('spinner').style.display = 'none';
            }

            updateLastUpdate();

        } catch (error) {
            console.error('Ошибка при проверке статуса:', error);
        }
    }, 500);

    console.log('✅ Мониторинг парсинга запущен (интервал 500ms)');
}

async function loadResults(isAppend = false) {
    if (!currentSessionId) {
        console.log('❌ Session ID не установлен');
        return;
    }

    try {
        console.log('📥 Загружаем результаты для сессии:', currentSessionId);
        const response = await fetch(`${serverUrl}/api/sessions/${currentSessionId}/data`);
        console.log('📊 Ответ от сервера:', response.status);

        if (!response.ok) {
            throw new Error(`Ошибка ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('📋 Результат:', result);

        const newListings = result.listings || [];

        // Если это продолжение батча - ДОБАВЛЯЕМ к существующим данным
        // Иначе - ЗАМЕНЯЕМ данные
        if (isAppend && allData.length > 0) {
            console.log(`📊 Добавляем ${newListings.length} новых объявлений к существующим ${allData.length}`);
            // Объединяем данные, избегая дубликатов по ID
            const existingIds = new Set(allData.map(item => item.id));
            const newItems = newListings.filter(item => !existingIds.has(item.id));
            allData = [...allData, ...newItems];
        } else {
            console.log(`📊 Заменяем данные: ${newListings.length} объявлений`);
            allData = newListings;
        }

        filteredData = [...allData];
        foundCount = allData.length;
        document.getElementById('foundCount').textContent = foundCount;

        console.log(`✅ Всего загруженно ${allData.length} объявлений`);

        displayResults();
        updateStats();

    } catch (error) {
        console.error('❌ Ошибка при загрузке результатов:', error);
        showMessage('error', `Ошибка загрузки: ${error.message}`);
    }
}

async function continueParsing() {
    if (!currentSessionId) return;

    document.getElementById('continueBtn').disabled = true;
    document.getElementById('spinnerContinue').style.display = 'inline-block';

    try {
        const response = await fetch(`${serverUrl}/api/sessions/${currentSessionId}/continue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        console.log('Continue response:', result);

        showMessage('info', `▶️ Продолжаем загрузку следующего батча... Текущих объявлений: ${result.currentCount}`);

        document.getElementById('spinnerContinue').style.display = 'none';
        document.getElementById('spinner').style.display = 'inline-block';
        document.getElementById('startBtn').disabled = true;
        document.getElementById('continueBtn').style.display = 'none';

        // НЕ сбрасываем таймер - продолжаем отсчет (не очищаем parsingStartTime)
        // startParsingTimer(); // Закомментировано - продолжаем существующий таймер

        // Очищаем старый интервал перед новым мониторингом
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
        }

        monitorParsing();

    } catch (error) {
        showMessage('error', `❌ Ошибка при продолжении: ${error.message}`);
        document.getElementById('continueBtn').disabled = false;
        document.getElementById('spinnerContinue').style.display = 'none';
    }
}

async function stopParsing() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    stopParsingTimer();
    document.getElementById('stopBtn').disabled = true;

    if (!currentSessionId) {
        showMessage('error', '❌ Сессия не найдена');
        return;
    }

    try {
        // Отправляем запрос на остановку парсинга на сервер
        const response = await fetch(`${serverUrl}/api/sessions/${currentSessionId}/stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (!response.ok) {
            showMessage('error', `❌ Ошибка остановки: ${result.error}`);
            return;
        }

        // Загружаем результаты остановленного парсинга
        await loadResults();
        showMessage('success', `✅ Парсинг остановлен! Собрано ${result.listingsCount} объявлений`);

        isStopped = true;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('continueBtn').disabled = true;
        document.getElementById('continueBtn').style.display = 'none';
        document.getElementById('resumeBtn').disabled = false;
        document.getElementById('resumeBtn').style.display = 'inline-block';
        document.getElementById('exportBtn').disabled = false;
        document.getElementById('spinner').style.display = 'none';
    } catch (error) {
        showMessage('error', `❌ Ошибка: ${error.message}`);
    }
}

/**
 * Запускает таймер парсинга
 */
function startParsingTimer() {
    parsingStartTime = Date.now();
    updateParsingTimer();

    if (parsingTimerInterval) {
        clearInterval(parsingTimerInterval);
    }

    parsingTimerInterval = setInterval(updateParsingTimer, 1000);
}

/**
 * Обновляет отображение таймера парсинга
 */
function updateParsingTimer() {
    if (!parsingStartTime) return;

    const elapsed = Math.floor((Date.now() - parsingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('parsingTimer').textContent = timeString;
}

/**
 * Останавливает таймер парсинга
 */
function stopParsingTimer() {
    if (parsingTimerInterval) {
        clearInterval(parsingTimerInterval);
        parsingTimerInterval = null;
    }
    parsingStartTime = null;
}

function showMessage(type, message) {
    const container = document.getElementById('statusMessage');
    container.innerHTML = `<div class="status-message ${type}">${message}</div>`;
}

// Переменные для сортировки
let sortConfig = {
    column: 'datePosted',
    direction: 'desc' // 'asc' или 'desc'
};

function displayResults() {
    const tableContainer = document.getElementById('tableContainer');

    if (filteredData.length === 0) {
        tableContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>Объявления не найдены</h3>
                <p>Попробуйте изменить параметры фильтрации</p>
            </div>
        `;
        return;
    }

    // Сортируем данные
    const sortedData = [...filteredData].sort((a, b) => {
        let aVal = a[sortConfig.column];
        let bVal = b[sortConfig.column];

        // Специальная обработка для цены (числовое сравнение)
        if (sortConfig.column === 'price') {
            aVal = Number(aVal) || 0;
            bVal = Number(bVal) || 0;
        }

        // Сравнение значений
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    let rows = '';
    for (const item of sortedData) {
        const statusClass = item.status === 'активно' ? 'status-active' : 'status-inactive';
        rows += `
            <tr>
                <td><a href="${item.url}" class="number-link" target="_blank">${item.number}</a></td>
                <td class="price">₽${item.price.toLocaleString('ru-RU')}</td>
                <td>${item.datePosted}</td>
                <td>${item.dateUpdated}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td>${item.region}</td>
                <td><a href="${item.url}" class="number-link" target="_blank">Перейти</a></td>
            </tr>
        `;
    }

    // Генерируем заголовки с индикаторами сортировки (как в Excel)
    const getHeaderHTML = (columnName, displayName) => {
        const indicator = sortConfig.column === columnName
            ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')
            : '';
        return `<th class="sortable-header" onclick="sortTable('${columnName}')">${displayName}${indicator}</th>`;
    };

    tableContainer.innerHTML = `
        <table>
            <thead>
                <tr class="header-row">
                    ${getHeaderHTML('number', 'Номер автомобиля')}
                    ${getHeaderHTML('price', 'Цена')}
                    ${getHeaderHTML('datePosted', 'Дата размещения')}
                    ${getHeaderHTML('dateUpdated', 'Дата поднятия')}
                    ${getHeaderHTML('status', 'Статус')}
                    ${getHeaderHTML('region', 'Регион')}
                    ${getHeaderHTML('url', 'Ссылка')}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

/**
 * Функция сортировки таблицы
 */
function sortTable(columnName) {
    if (sortConfig.column === columnName) {
        // Переключаем направление сортировки
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // Устанавливаем новую колонку и направление по умолчанию
        sortConfig.column = columnName;
        sortConfig.direction = 'asc';
    }
    displayResults();
}

/**
 * Функция сортировки таблицы регионов
 */
function sortRegionsTable(columnName) {
    if (regionsSortConfig.column === columnName) {
        // Переключаем направление сортировки
        regionsSortConfig.direction = regionsSortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // Устанавливаем новую колонку и направление по умолчанию
        regionsSortConfig.column = columnName;
        regionsSortConfig.direction = 'asc';
    }
    renderRegionsTable();
}

/**
 * Отрендеривает таблицу регионов с сортировкой
 */
function renderRegionsTable() {
    // Копируем данные для сортировки
    let sortedData = [...regionsSortConfig.data];

    // Выполняем сортировку
    sortedData.sort((a, b) => {
        let aValue = a[regionsSortConfig.column];
        let bValue = b[regionsSortConfig.column];

        // Для числовых значений
        if (typeof aValue === 'number' && typeof bValue === 'number') {
            return regionsSortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        // Для строк
        if (typeof aValue === 'string' && typeof bValue === 'string') {
            return regionsSortConfig.direction === 'asc'
                ? aValue.localeCompare(bValue, 'ru')
                : bValue.localeCompare(aValue, 'ru');
        }

        return 0;
    });

    // Обновляем индикаторы сортировки
    document.getElementById('regionSort').textContent = regionsSortConfig.column === 'region'
        ? (regionsSortConfig.direction === 'asc' ? '▲' : '▼')
        : '';
    document.getElementById('countSort').textContent = regionsSortConfig.column === 'count'
        ? (regionsSortConfig.direction === 'asc' ? '▲' : '▼')
        : '';
    document.getElementById('avgPriceSort').textContent = regionsSortConfig.column === 'avgPrice'
        ? (regionsSortConfig.direction === 'asc' ? '▲' : '▼')
        : '';

    // Генерируем HTML для таблицы
    let regionRows = '';
    for (const regionData of sortedData) {
        regionRows += `
            <tr>
                <td><a href="#" class="region-link" onclick="filterByRegion('${regionData.region}'); return false;">📍 ${regionData.region}</a></td>
                <td>${regionData.count}</td>
                <td>₽${regionData.avgPrice.toLocaleString('ru-RU')}</td>
            </tr>
        `;
    }

    document.getElementById('regionsBody').innerHTML = regionRows || '<tr><td colspan="3" style="text-align: center; color: #999;">Нет данных</td></tr>';
}

async function updateStats() {
    if (!currentSessionId || allData.length === 0) return;

    try {
        const response = await fetch(`${serverUrl}/api/stats/${currentSessionId}`);
        const stats = await response.json();

        document.getElementById('totalCount').textContent = stats.totalListings;
        document.getElementById('avgPrice').textContent = stats.stats.avgPriceFormatted;
        document.getElementById('minPriceResult').textContent = '₽' + stats.minPrice.toLocaleString('ru-RU');
        document.getElementById('maxPriceResult').textContent = '₽' + stats.maxPrice.toLocaleString('ru-RU');
        document.getElementById('uniqueRegions').textContent = stats.uniqueRegions;
        document.getElementById('uniqueSellers').textContent = stats.uniqueSellers;

        if (stats.regions && stats.regions.length > 0) {
            // Сохраняем данные регионов для сортировки
            regionsSortConfig.data = stats.regions.map(region => {
                const regionListings = allData.filter(l => l.region === region);
                const avgPrice = regionListings.length > 0
                    ? Math.round(regionListings.reduce((a, b) => a + b.price, 0) / regionListings.length)
                    : 0;
                return {
                    region: region,
                    count: regionListings.length,
                    avgPrice: avgPrice
                };
            });

            // Отрендериваем таблицу регионов с сортировкой
            renderRegionsTable();
        }

    } catch (error) {
        console.error('Ошибка при обновлении статистики:', error);
    }
}

function applyFilters() {
    const searchQuery = document.getElementById('searchFilter').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;

    filteredData = allData.filter(item => {
        const matchesSearch = !searchQuery ||
            (item.number && item.number.toLowerCase().includes(searchQuery)) ||
            (item.region && item.region.toLowerCase().includes(searchQuery));

        const matchesStatus = !statusFilter || item.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    displayResults();
}

/**
 * Применяет фильтры прямо в таблице результатов
 */
function resetFilters() {
    document.getElementById('searchFilter').value = '';
    document.getElementById('statusFilter').value = '';
    filteredData = [...allData];
    displayResults();
}

/**
 * Фильтрует результаты по выбранному региону и переходит на вкладку "Данные"
 */
function filterByRegion(region) {
    // Очищаем существующие фильтры
    document.getElementById('searchFilter').value = '';
    document.getElementById('statusFilter').value = '';

    // Фильтруем по региону
    filteredData = allData.filter(item => item.region === region);

    // Обновляем таблицу результатов
    displayResults();

    // Переходим на вкладку "Данные"
    switchTab('data');

    // Показываем сообщение
    showMessage('info', `🔍 Показаны объявления из региона: ${region} (${filteredData.length} объявлений)`);
}

async function exportData() {
    if (allData.length === 0) {
        showMessage('error', 'Нет данных для экспорта');
        return;
    }

    try {
        showMessage('info', '⏳ Подготавливаю файл для экспорта...');

        // Проверяем, это загрузка из БД или из парсинга сессии
        let xlsxUrl;
        if (currentSessionId && currentSessionId.startsWith('db_load_')) {
            // Это загрузка из БД - используем /api/db/export
            xlsxUrl = `${serverUrl}/api/db/export`;
        } else if (currentSessionId) {
            // Это парсинг сессия - используем сессионный экспорт
            xlsxUrl = `${serverUrl}/api/sessions/${currentSessionId}/export?format=xlsx`;
        } else {
            // Нет сессии - используем DB экспорт
            xlsxUrl = `${serverUrl}/api/db/export`;
        }

        console.log(`📥 Загружаю файл с URL: ${xlsxUrl}`);

        const response = await fetch(xlsxUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `autonomera777_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showMessage('success', `✅ Excel файл с ${allData.length} объявлениями загружен`);
        console.log(`✅ Файл успешно скачан`);
    } catch (error) {
        showMessage('error', `❌ Ошибка при экспорте: ${error.message}`);
        console.error('Ошибка экспорта:', error);
    }
}

function switchTab(tabName, eventTarget) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');

    // Если передан eventTarget, используем его, иначе ищем соответствующую кнопку
    if (eventTarget) {
        eventTarget.classList.add('active');
    } else {
        // Находим кнопку по содержимому и активируем её
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => {
            if (btn.textContent.toLowerCase().includes(tabName.toLowerCase())) {
                btn.classList.add('active');
            }
        });
    }
}

function updateLastUpdate() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('lastUpdate').textContent = `${hours}:${minutes}`;
}

/**
 * Продолжает парсинг с места остановки
 */
async function resumeParsing() {
    if (!currentSessionId) {
        showMessage('error', '❌ Сессия не найдена');
        return;
    }

    document.getElementById('resumeBtn').disabled = true;
    document.getElementById('spinnerResume').style.display = 'inline-block';
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('startBtn').disabled = true;

    try {
        // Сбрасываем и запускаем таймер заново при возобновлении парсинга
        parsingStartTime = null;
        startParsingTimer();

        const response = await fetch(`${serverUrl}/api/sessions/${currentSessionId}/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        console.log('Resume response:', result);

        if (!response.ok) {
            showMessage('error', `❌ Ошибка возобновления: ${result.error}`);
            document.getElementById('resumeBtn').disabled = false;
            document.getElementById('spinnerResume').style.display = 'none';
            return;
        }

        showMessage('info', `▶️ Продолжаем парсинг с места остановки... Текущих объявлений: ${result.currentCount}`);

        document.getElementById('spinnerResume').style.display = 'none';
        document.getElementById('spinner').style.display = 'inline-block';
        document.getElementById('resumeBtn').style.display = 'none';
        isStopped = false;

        monitorParsing();

    } catch (error) {
        showMessage('error', `❌ Ошибка при продолжении: ${error.message}`);
        document.getElementById('resumeBtn').disabled = false;
        document.getElementById('spinnerResume').style.display = 'none';
    }
}

/**
 * Отображает статистику по базе данных
 */
function displayOverview(overview) {
    if (!overview) return;

    // Обновляем основную статистику
    document.getElementById('totalCount').textContent = overview.total || '0';
    document.getElementById('uniqueRegions').textContent = overview.regionsCount || '0';
    document.getElementById('avgPrice').textContent = '₽' + (overview.avgPrice || 0).toLocaleString('ru-RU');
    document.getElementById('minPriceResult').textContent = '₽' + (overview.minPrice || 0).toLocaleString('ru-RU');
    document.getElementById('maxPriceResult').textContent = '₽' + (overview.maxPrice || 0).toLocaleString('ru-RU');

    console.log('📊 Статистика обновлена:', overview);
}

/**
 * Отображает таблицу данных объявлений
 */
function displayData(data) {
    if (!data || data.length === 0) {
        document.getElementById('tableContainer').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Нет данных</h3><p>БД пуста. Дождитесь первого парсинга в 00:01</p></div>';
        return;
    }

    let tableHtml = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background-color: #f5f5f5; border-bottom: 2px solid #ddd;">
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Номер</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Регион</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Цена</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Статус</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Дата размещения</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Дата поднятия</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Изменение цены</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Дата изм. цены</th>
                    <th style="padding: 12px; text-align: left; font-weight: bold;">Ссылка</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Показываем все данные (но таблица может быть большой, браузер справится)
    data.forEach(item => {
        const price = (item.price || 0).toLocaleString('ru-RU');
        const datePosted = item.date_posted ? new Date(item.date_posted).toLocaleDateString('ru-RU') : '-';
        const dateUpdated = item.date_updated ? new Date(item.date_updated).toLocaleDateString('ru-RU') : '-';
        const priceChange = item.last_change && item.last_change.price_delta ? item.last_change.price_delta : null;
        const priceChangeStr = priceChange ? (priceChange > 0 ? `↑+${priceChange.toLocaleString('ru-RU')}` : `↓${priceChange.toLocaleString('ru-RU')}`) : '-';
        const dateUpdatedSite = item.last_change && item.last_change.date_updated_site ? new Date(item.last_change.date_updated_site).toLocaleDateString('ru-RU') : '-';

        tableHtml += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${item.nomer || '-'}</td>
                <td style="padding: 10px;">${item.region || '-'}</td>
                <td style="padding: 10px;">₽${price}</td>
                <td style="padding: 10px;">${item.status || '-'}</td>
                <td style="padding: 10px;">${datePosted}</td>
                <td style="padding: 10px;">${dateUpdated}</td>
                <td style="padding: 10px;">${priceChangeStr}</td>
                <td style="padding: 10px;">${dateUpdatedSite}</td>
                <td style="padding: 10px;"><a href="${item.url || '#'}" target="_blank" style="color: #0066cc; text-decoration: none;">→</a></td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    document.getElementById('tableContainer').innerHTML = tableHtml;
    console.log(`📋 Таблица обновлена: ${data.length} объявлений (все записи показаны)`);
}

/**
 * Отображает аналитику по регионам
 */
function displayRegions(regions) {
    if (!regions || regions.length === 0) {
        document.getElementById('regionsBody').innerHTML = '<tr><td colspan="3" style="text-align: center; color: #999;">Нет данных</td></tr>';
        return;
    }

    let html = '';
    regions.forEach(region => {
        const avgPrice = (region.avg_price || 0).toLocaleString('ru-RU');
        html += `
            <tr>
                <td>${region.region || 'Неизвестный регион'}</td>
                <td>${region.count || 0}</td>
                <td>₽${avgPrice}</td>
            </tr>
        `;
    });

    document.getElementById('regionsBody').innerHTML = html;
    console.log(`🗺️ Регионы обновлены: ${regions.length} регионов`);
}

window.addEventListener('load', async () => {
    console.log('🚗 Парсер АВТОНОМЕРА777 готов');

    // Автоматически загружаем данные из БД при загрузке страницы
    try {
        console.log('📥 Инициализация: загружаю данные из БД...');
        await startParsing();
    } catch (error) {
        console.log('ℹ️ Автоматическая загрузка данных завершилась с ошибкой:', error.message);
    }

    // Проверяем, есть ли активное парсинг в localstorage
    const savedSessionId = localStorage.getItem('activeParsingSession');
    if (savedSessionId) {
        try {
            const response = await fetch(`${serverUrl}/api/sessions/${savedSessionId}/status`);
            if (response.ok) {
                const status = await response.json();
                if (status.status === 'running' || status.status === 'paused') {
                    console.log('⏳ Найдена активная сессия парсинга:', savedSessionId);
                    currentSessionId = savedSessionId;
                    monitorParsing();
                }
            }
        } catch (error) {
            console.log('ℹ️ Не удалось восстановить парсинг сессию:', error.message);
        }
    }
});
