// Autonomera777 Parser - Main JavaScript

let allData = [];
let filteredData = [];
let currentSessionId = null;
let statusCheckInterval = null;
let parsingStartTime = null;
let parsingTimerInterval = null;
let foundCount = 0; // Количество найденных объявлений
let isStopped = false; // Был ли парсинг остановлен

// Фильтры для таблицы
let headerFilters = {
    number: '',
    price: '',
    dateUpdated: '',
    region: ''
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

async function startParsing() {
    const minPrice = parseInt(document.getElementById('minPrice').value) || 0;
    const maxPrice = parseInt(document.getElementById('maxPrice').value) || Infinity;
    const maxPages = 50;
    const delayMs = 1000;

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
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('resumeBtn').disabled = true;
    document.getElementById('resumeBtn').style.display = 'none';
    document.getElementById('spinner').style.display = 'inline-block';
    document.getElementById('progressSection').classList.add('active');

    showMessage('info', '🚀 Начинаем парсинг...');
    document.getElementById('parsingTimer').textContent = '00:00';
    foundCount = 0;
    document.getElementById('foundCount').textContent = '0';
    isStopped = false;
    console.log('📊 Счётчик найденных объявлений инициализирован: 0');
    startParsingTimer();

    try {
        const response = await fetch(`${serverUrl}/api/parse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                minPrice,
                maxPrice: maxPrice === Infinity ? 999999999 : maxPrice,
                region: null,
                maxPages,
                delayMs
            })
        });

        const result = await response.json();
        currentSessionId = result.sessionId;

        console.log('Session ID:', currentSessionId);
        showMessage('success', '✅ Парсинг начат. ID сессии: ' + currentSessionId);

        monitorParsing();

    } catch (error) {
        showMessage('error', `❌ Ошибка: ${error.message}`);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('spinner').style.display = 'none';
    }
}

async function monitorParsing() {
    if (!currentSessionId) return;

    statusCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${serverUrl}/api/sessions/${currentSessionId}/status`);
            const status = await response.json();

            document.getElementById('sessionStatus').textContent = status.status;
            document.getElementById('loadedCount').textContent = status.listingsCount;

            // Обновляем счетчик найденных объявлений в реальном времени
            foundCount = status.listingsCount;
            document.getElementById('foundCount').textContent = foundCount;

            // Debug logging
            console.log(`📊 Статус обновлен: ${status.status}, найдено объявлений: ${foundCount}`);

            if (status.status === 'completed') {
                clearInterval(statusCheckInterval);
                stopParsingTimer();
                await loadResults();
                showMessage('success', `✅ Парсинг завершен! Загруженно ${status.listingsCount} объявлений`);
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
                await loadResults();
                showMessage('success', `✅ Батч ${status.batch.number || 1} готов! Загруженно ${status.listingsCount} объявлений\n👉 Нажмите "Продолжить" для загрузки следующего батча (еще +2000)`);
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
                stopParsingTimer();
                await loadResults();
                showMessage('success', `✅ Парсинг остановлен! Собрано ${status.listingsCount} объявлений`);
                document.getElementById('startBtn').disabled = false;
                document.getElementById('continueBtn').disabled = true;
                document.getElementById('continueBtn').style.display = 'none';
                document.getElementById('stopBtn').disabled = true;
                document.getElementById('exportBtn').disabled = false;
                document.getElementById('spinner').style.display = 'none';
            } else if (status.status === 'error') {
                clearInterval(statusCheckInterval);
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
}

async function loadResults() {
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

        allData = result.listings || [];
        filteredData = [...allData];
        foundCount = allData.length;
        document.getElementById('foundCount').textContent = foundCount;

        // Очищаем фильтры при загрузке новых результатов
        headerFilters = {
            number: '',
            price: '',
            dateUpdated: '',
            region: ''
        };

        console.log(`✅ Загруженно ${allData.length} объявлений`);

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

        showMessage('info', `▶️ Продолжаем загрузку... Текущих объявлений: ${result.currentCount}`);

        document.getElementById('spinnerContinue').style.display = 'none';
        document.getElementById('spinner').style.display = 'inline-block';
        document.getElementById('startBtn').disabled = true;
        document.getElementById('continueBtn').style.display = 'none';

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

    // Генерируем заголовки с индикаторами сортировки
    const getHeaderHTML = (columnName, displayName, showFilter = false) => {
        const indicator = sortConfig.column === columnName
            ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')
            : '';
        const filterInput = showFilter
            ? `<input type="text" class="header-filter" data-column="${columnName}" placeholder="🔍" onclick="event.stopPropagation()" oninput="applyHeaderFilters()">`
            : '';
        return `<th class="sortable-header" onclick="sortTable('${columnName}')">${displayName}${indicator}${filterInput}</th>`;
    };

    tableContainer.innerHTML = `
        <table>
            <thead>
                <tr class="header-row">
                    ${getHeaderHTML('number', 'Номер автомобиля', true)}
                    ${getHeaderHTML('price', 'Цена', true)}
                    ${getHeaderHTML('datePosted', 'Дата размещения')}
                    ${getHeaderHTML('dateUpdated', 'Дата обновления', true)}
                    ${getHeaderHTML('status', 'Статус')}
                    ${getHeaderHTML('region', 'Регион', true)}
                    ${getHeaderHTML('url', 'Ссылка')}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    // Восстанавливаем значения фильтров в инпутах
    setTimeout(() => {
        document.querySelectorAll('.header-filter').forEach(input => {
            const column = input.getAttribute('data-column');
            if (headerFilters[column]) {
                input.value = headerFilters[column];
            }
        });
    }, 0);
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
            let regionRows = '';
            for (const region of stats.regions) {
                const regionListings = allData.filter(l => l.region === region);
                const avgPrice = regionListings.length > 0
                    ? Math.round(regionListings.reduce((a, b) => a + b.price, 0) / regionListings.length)
                    : 0;

                regionRows += `
                    <tr>
                        <td><a href="#" class="region-link" onclick="filterByRegion('${region}'); return false;">📍 ${region}</a></td>
                        <td>${regionListings.length}</td>
                        <td>₽${avgPrice.toLocaleString('ru-RU')}</td>
                    </tr>
                `;
            }
            document.getElementById('regionsBody').innerHTML = regionRows;
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
    if (!currentSessionId || allData.length === 0) {
        showMessage('error', 'Нет данных для экспорта');
        return;
    }

    const xlsxUrl = `${serverUrl}/api/sessions/${currentSessionId}/export?format=xlsx`;
    const link = document.createElement('a');
    link.href = xlsxUrl;
    link.download = `autonomera777_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();

    showMessage('success', `✅ Excel файл с ${allData.length} объявлениями загружен`);
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
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
        // Запускаем таймер с момента возобновления (не сбрасываем)
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
 * Применяет фильтры на основе значений в инпутах заголовков
 */
function applyHeaderFilters() {
    // Собираем значения из всех фильтров
    document.querySelectorAll('.header-filter').forEach(input => {
        const column = input.getAttribute('data-column');
        headerFilters[column] = input.value.toLowerCase();
    });

    // Фильтруем данные
    filteredData = allData.filter(item => {
        // Фильтр по номеру
        if (headerFilters.number && !item.number.toLowerCase().includes(headerFilters.number)) {
            return false;
        }

        // Фильтр по цене (точное совпадение или диапазон)
        if (headerFilters.price) {
            const priceFilter = headerFilters.price.toLowerCase();
            // Проверяем диапазон цен (например: "100000-500000")
            if (priceFilter.includes('-')) {
                const [minStr, maxStr] = priceFilter.split('-');
                const min = parseInt(minStr) || 0;
                const max = parseInt(maxStr) || Infinity;
                if (item.price < min || item.price > max) {
                    return false;
                }
            } else if (priceFilter) {
                // Проверяем вхождение цены в текст
                const price = item.price.toString();
                if (!price.includes(priceFilter)) {
                    return false;
                }
            }
        }

        // Фильтр по дате обновления
        if (headerFilters.dateUpdated && !item.dateUpdated.toLowerCase().includes(headerFilters.dateUpdated)) {
            return false;
        }

        // Фильтр по региону
        if (headerFilters.region && !item.region.toLowerCase().includes(headerFilters.region)) {
            return false;
        }

        return true;
    });

    displayResults();
}

window.addEventListener('load', () => {
    console.log('🚗 Парсер АВТОНОМЕРА777 готов');
});
