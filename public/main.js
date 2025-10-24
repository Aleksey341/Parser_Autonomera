// Autonomera777 Parser - Main JavaScript

let allData = [];
let filteredData = [];
let currentSessionId = null;
let statusCheckInterval = null;

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
    document.getElementById('spinner').style.display = 'inline-block';
    document.getElementById('progressSection').classList.add('active');

    showMessage('info', '🚀 Начинаем парсинг...');

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

            if (status.status === 'completed') {
                clearInterval(statusCheckInterval);
                await loadResults();
                showMessage('success', `✅ Парсинг завершен! Загруженно ${status.listingsCount} объявлений`);
                document.getElementById('startBtn').disabled = false;
                document.getElementById('continueBtn').disabled = true;
                document.getElementById('continueBtn').style.display = 'none';
                document.getElementById('stopBtn').disabled = true;
                document.getElementById('exportBtn').disabled = false;
                document.getElementById('spinner').style.display = 'none';
            } else if (status.status === 'paused') {
                clearInterval(statusCheckInterval);
                await loadResults();
                showMessage('success', `✅ Батч ${status.batch.number || 1} готов! Загруженно ${status.listingsCount} объявлений\n👉 Нажмите "Продолжить" для загрузки следующего батча (еще +500)`);
                document.getElementById('startBtn').disabled = true;
                document.getElementById('continueBtn').disabled = false;
                document.getElementById('continueBtn').style.display = 'inline-block';
                document.getElementById('stopBtn').disabled = false;
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
    }, 1000);
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

function stopParsing() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    document.getElementById('stopBtn').disabled = true;
    showMessage('info', 'Мониторинг остановлен');
}

function showMessage(type, message) {
    const container = document.getElementById('statusMessage');
    container.innerHTML = `<div class="status-message ${type}">${message}</div>`;
}

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

    let rows = '';
    for (const item of filteredData) {
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

    tableContainer.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Номер автомобиля</th>
                    <th>Цена</th>
                    <th>Дата размещения</th>
                    <th>Дата обновления</th>
                    <th>Статус</th>
                    <th>Регион</th>
                    <th>URL</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
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
                        <td>${region}</td>
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

function resetFilters() {
    document.getElementById('searchFilter').value = '';
    document.getElementById('statusFilter').value = '';
    filteredData = [...allData];
    displayResults();
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

window.addEventListener('load', () => {
    console.log('🚗 Парсер АВТОНОМЕРА777 готов');
});
