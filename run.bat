@echo off
REM Батник для быстрого запуска сервера парсера

echo.
echo ============================================
echo Парсер АВТОНОМЕРА777
echo ============================================
echo.

REM Проверяем, установлен ли Node.js
node --version > nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Node.js не установлен!
    echo Скачайте его с https://nodejs.org/
    pause
    exit /b 1
)

REM Проверяем, установлены ли зависимости
if not exist "node_modules\" (
    echo Установка зависимостей...
    call npm install
    if errorlevel 1 (
        echo ОШИБКА при установке зависимостей!
        pause
        exit /b 1
    )
)

REM Запускаем сервер
echo.
echo Запуск сервера...
echo Откройте браузер: http://localhost:3000
echo.
echo Для остановки нажмите Ctrl+C
echo.

node server.js

pause
