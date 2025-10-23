# 🚀 Развертывание Парсера АВТОНОМЕРА777 на GitHub & Cloud

Полное руководство по развертыванию парсера для использования коллегами через интернет.

## 📋 Содержание

1. [Подготовка GitHub репозитория](#подготовка-github-репозитория)
2. [Развертывание на Heroku](#развертывание-на-heroku)
3. [Развертывание на Railway.app](#развертывание-на-railwayapp)
4. [Развертывание на Render](#развертывание-на-render)
5. [Развертывание на своем сервере](#развертывание-на-своем-сервере)
6. [Использование коллегами](#использование-коллегами)

---

## Подготовка GitHub репозитория

### Шаг 1: Создание GitHub аккаунта

Если у вас еще нет аккаунта:
1. Перейдите на https://github.com
2. Нажмите "Sign up"
3. Создайте аккаунт

### Шаг 2: Создание нового репозитория

1. На GitHub нажмите **"+"** → **"New repository"**
2. Заполните:
   - **Repository name:** `autonomera777-parser`
   - **Description:** Parser for autonomera777.net - Russian license plate marketplace
   - **Visibility:** Public (для доступа коллег)
   - **Initialize:** Оставьте пусто

3. Нажмите **"Create repository"**

### Шаг 3: Установка Git на Windows

1. Скачайте Git с https://git-scm.com/download/win
2. Установите (нажимайте "Next" везде)
3. Перезагрузитесь

### Шаг 4: Проверка Git

```bash
git --version
```

Должна вывести версию, например: `git version 2.40.0`

### Шаг 5: Конфигурация Git

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Шаг 6: Инициализация и первый коммит

В папке `C:\Users\cobra\` откройте Командную строку:

```bash
# Инициализируем репозиторий
git init

# Добавляем все файлы
git add .

# Создаем первый коммит
git commit -m "Initial commit: АВТОНОМЕРА777 parser with web interface and API"

# Добавляем remote (замените YOUR_USERNAME и YOUR_REPO на свои)
git remote add origin https://github.com/YOUR_USERNAME/autonomera777-parser.git

# Загружаем на GitHub (ветка main)
git branch -M main
git push -u origin main
```

### Шаг 7: Проверка на GitHub

Откройте https://github.com/YOUR_USERNAME/autonomera777-parser

Должны увидеть все ваши файлы в интернете!

---

## Развертывание на Heroku

**Плюсы:** Легко, бесплатно (с ограничениями)
**Минусы:** Платная версия после пробного периода

### Шаг 1: Создание Heroku аккаунта

1. Перейдите на https://www.heroku.com
2. Нажмите "Sign up"
3. Создайте аккаунт

### Шаг 2: Установка Heroku CLI

1. Скачайте с https://devcenter.heroku.com/articles/heroku-cli
2. Установите
3. Перезагрузитесь

### Шаг 3: Проверка Heroku CLI

```bash
heroku --version
```

### Шаг 4: Логин в Heroku

```bash
heroku login
```

Откроется браузер, авторизуйтесь.

### Шаг 5: Создание Heroku приложения

В папке `C:\Users\cobra\`:

```bash
heroku create autonomera777-parser
```

Будет создано приложение, например:
```
https://autonomera777-parser-abc12345.herokuapp.com/
```

### Шаг 6: Развертывание

```bash
git push heroku main
```

Heroku автоматически:
- Скачает зависимости (`npm install`)
- Запустит `npm start` (из Procfile)
- Разместит приложение онлайн

### Шаг 7: Проверка

```bash
heroku open
```

Откроется ваш парсер в браузере!

Или вручную откройте: https://autonomera777-parser-abc12345.herokuapp.com/

### Просмотр логов

```bash
heroku logs --tail
```

---

## Развертывание на Railway.app

**Плюсы:** Очень простой, $5 в месяц кредит
**Минусы:** Нужна карта для верификации

### Шаг 1: Создание Railway аккаунта

1. Перейдите на https://railway.app
2. Нажмите "Login" → "GitHub"
3. Авторизуйтесь через GitHub

### Шаг 2: Создание проекта

1. Нажмите "New Project"
2. Выберите "Deploy from GitHub"
3. Выберите ваш репозиторий `autonomera777-parser`

### Шаг 3: Конфигурация

Railway автоматически:
- Обнаружит `Procfile`
- Установит `package.json` зависимости
- Запустит приложение

### Шаг 4: Получение URL

На странице проекта найдите "Domains":
```
https://autonomera777-parser.up.railway.app/
```

Это ссылка для коллег!

---

## Развертывание на Render

**Плюсы:** Бесплатно, просто, хороший апстайм
**Минусы:** Может спать при неиспользовании

### Шаг 1: Создание Render аккаунта

1. Перейдите на https://render.com
2. Нажмите "Get Started"
3. Авторизуйтесь через GitHub

### Шаг 2: Создание Web Service

1. Нажмите "New" → "Web Service"
2. Выберите ваш репозиторий на GitHub

### Шаг 3: Конфигурация

В форме укажите:
- **Name:** autonomera777-parser
- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`

### Шаг 4: Развертывание

Нажмите "Create Web Service"

Render автоматически разместит приложение. URL будет примерно:
```
https://autonomera777-parser.onrender.com/
```

---

## Развертывание на своем сервере

Если у вас есть свой VPS/сервер (AWS, DigitalOcean, Linode и т.д.):

### Требования

- Ubuntu 20.04 LTS или выше
- SSH доступ
- Node.js 14+

### Быстрая установка (один скрипт)

На сервере:

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем Node.js
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Клонируем репозиторий
git clone https://github.com/YOUR_USERNAME/autonomera777-parser.git
cd autonomera777-parser

# Устанавливаем зависимости
npm install

# Запускаем сервер
NODE_ENV=production npm start
```

### Использование PM2 (для постоянного запуска)

```bash
# Устанавливаем PM2
sudo npm install -g pm2

# Запускаем приложение через PM2
pm2 start server.js --name "autonomera777"

# Делаем автозапуск при перезагрузке
pm2 startup
pm2 save
```

### Использование Nginx как реверс-прокси

```bash
sudo apt install nginx

# Редактируем конфиг
sudo nano /etc/nginx/sites-available/default
```

Вставьте:

```nginx
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Перезагружаем Nginx:

```bash
sudo systemctl restart nginx
```

Приложение будет доступно на: `http://your-server-ip/`

---

## Использование коллегами

### Способ 1: Использование облачной ссылки

После развертывания (Heroku, Railway, Render):

1. Дайте коллегам ссылку:
   ```
   https://autonomera777-parser.herokuapp.com
   https://autonomera777-parser.up.railway.app
   https://autonomera777-parser.onrender.com
   ```

2. Коллеги просто открывают ссылку в браузере
3. Используют веб-интерфейс так же, как локально

### Способ 2: Установка локально

Коллеги могут установить парсер локально:

```bash
# Клонируют репозиторий
git clone https://github.com/YOUR_USERNAME/autonomera777-parser.git
cd autonomera777-parser

# Устанавливают зависимости
npm install

# Запускают сервер
npm start

# Открывают http://localhost:3000
```

### Способ 3: Docker (для опытных)

Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Коллеги запускают:

```bash
docker build -t autonomera777-parser .
docker run -p 3000:3000 autonomera777-parser
```

---

## Таблица сравнения

| Платформа | Цена | Легкость | Апстайм | Рекомендация |
|-----------|------|---------|--------|--------------|
| **Heroku** | Платная | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Лучше для начинающих |
| **Railway** | $5/мес | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Отличное соотношение |
| **Render** | Бесплатно | ⭐⭐⭐⭐ | ⭐⭐⭐ | Хорошо для тестов |
| **VPS** | $3-10/мес | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Для production |

---

## 🔗 Ссылки

### Платформы развертывания:
- **Heroku:** https://www.heroku.com
- **Railway:** https://railway.app
- **Render:** https://render.com
- **DigitalOcean:** https://www.digitalocean.com

### Инструменты:
- **Git:** https://git-scm.com
- **GitHub:** https://github.com
- **Heroku CLI:** https://devcenter.heroku.com/articles/heroku-cli

---

## 📚 Дополнительные ресурсы

- [Git Guide](https://git-scm.com/book/ru/v2)
- [Node.js Best Practices](https://nodejs.org/en/docs/)
- [Express.js Tutorial](https://expressjs.com/)

---

## 🆘 Решение проблем

### "fatal: remote origin already exists"

```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/autonomera777-parser.git
```

### "Permission denied (publickey)"

```bash
# Добавьте SSH ключ на GitHub
ssh-keygen -t ed25519 -C "your.email@example.com"
# Затем скопируйте ключ на GitHub в Settings → SSH Keys
```

### Приложение не запускается

1. Проверьте логи:
   ```bash
   heroku logs --tail  # Для Heroku
   # или
   pm2 logs autonomera777  # Для VPS
   ```

2. Убедитесь что установлены все зависимости:
   ```bash
   npm install
   ```

3. Проверьте что PORT может быть динамический:
   ```javascript
   const PORT = process.env.PORT || 3000;
   ```

---

**Успешного развертывания! 🚀**

Если возникли вопросы - обратитесь к официальной документации платформ развертывания.
