# 📤 Загрузка парсера на GitHub (5 минут)

## Что вам понадобится:
1. ✅ GitHub аккаунт (создать за 1 минуту на https://github.com)
2. ✅ Git установлен на компьютер (https://git-scm.com/download/win)

---

## ШАГ 1️⃣: Создание репозитория на GitHub

1. Откройте https://github.com и авторизуйтесь
2. Нажмите **"+"** в левом верхнем углу
3. Выберите **"New repository"**
4. Заполните:
   - **Repository name:** `autonomera777-parser`
   - **Description:** Parser for autonomera777.net
   - **Visibility:** ⭕ **Public** (для доступа коллег)
5. **НЕ ВЫБИРАЙТЕ** "Initialize this repository"
6. Нажмите **"Create repository"**

### Вы получите:
```
https://github.com/YOUR_USERNAME/autonomera777-parser
```

**Скопируйте эту ссылку** - она понадобится!

---

## ШАГ 2️⃣: Конфигурация Git на компьютере

Откройте **Командную строку** (cmd.exe) и выполните:

```bash
git config --global user.name "Ваше имя"
git config --global user.email "your.email@gmail.com"
```

Это сделаете только один раз.

---

## ШАГ 3️⃣: Загрузка парсера на GitHub

Откройте **Командную строку** в папке `C:\Users\cobra\`:

### Способ А: Автоматический скрипт

```bash
git init
git add .
git commit -m "Initial commit: АВТОНОМЕРА777 parser"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/autonomera777-parser.git
git push -u origin main
```

**Замените:**
- `YOUR_USERNAME` на ваш логин GitHub (например: `john_doe`)
- `autonomera777-parser` на название вашего репозитория

### Способ Б: Пошагово (для понимания)

```bash
# 1. Инициализируем Git репозиторий
git init

# 2. Добавляем все файлы
git add .

# 3. Создаем первый коммит
git commit -m "Initial commit: АВТОНОМЕРА777 parser"

# 4. Переименовываем ветку (GitHub использует main)
git branch -M main

# 5. Подключаем к GitHub
git remote add origin https://github.com/YOUR_USERNAME/autonomera777-parser.git

# 6. Загружаем файлы
git push -u origin main
```

---

## ШАГ 4️⃣: Проверка

Откройте в браузере:
```
https://github.com/YOUR_USERNAME/autonomera777-parser
```

**Должны увидеть:**
- ✅ Все ваши файлы (parser.js, server.js, README.md и т.д.)
- ✅ Зеленую кнопку "Code"
- ✅ Информацию о репозитории

---

## ШАГ 5️⃣: Получение ссылки для коллег

Готовая GitHub ссылка:
```
https://github.com/YOUR_USERNAME/autonomera777-parser
```

### Коллеги могут:

**Способ 1: Использовать локально**
```bash
git clone https://github.com/YOUR_USERNAME/autonomera777-parser.git
cd autonomera777-parser
npm install
npm start
```

Затем открыть http://localhost:3000

**Способ 2: Развернуть на облаке**
- Следовать инструкциям в файле `DEPLOYMENT.md`

---

## ⚠️ Частые ошибки и решение

### Ошибка: "fatal: not a git repository"
**Решение:** Убедитесь, что вы находитесь в папке C:\Users\cobra\
```bash
cd C:\Users\cobra\
```

### Ошибка: "fatal: remote origin already exists"
**Решение:** Удалите старую ссылку
```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/autonomera777-parser.git
```

### Ошибка: "Permission denied"
**Решение:** Используйте HTTPS вместо SSH, или добавьте SSH ключ на GitHub

### Ошибка при git push
**Решение:** GitHub может попросить авторизацию. Введите:
- Username: ваш логин GitHub
- Password: ваш личный токен (создайте на GitHub → Settings → Developer settings → Personal access tokens)

---

## 🚀 ПРОДВИНУТЫЙ ВАРИАНТ: Развертывание на облаке

После загрузки на GitHub вы можете развернуть приложение онлайн:

### Вариант 1: Railway.app (рекомендуется, $5/месяц кредит)
1. Откройте https://railway.app
2. Нажмите "Login" → "GitHub"
3. Авторизуйтесь
4. Нажмите "New Project"
5. Выберите "Deploy from GitHub"
6. Выберите `autonomera777-parser`
7. Готово! Приложение будет доступно онлайн

Ссылка будет примерно:
```
https://autonomera777-parser.up.railway.app/
```

### Вариант 2: Heroku
1. Откройте https://www.heroku.com
2. Создайте аккаунт
3. Установите Heroku CLI
4. В папке проекта выполните:
   ```bash
   heroku login
   heroku create autonomera777-parser
   git push heroku main
   ```
5. Готово! Ссылка будет примерно:
   ```
   https://autonomera777-parser-abc12345.herokuapp.com
   ```

---

## 📋 Чек-лист

- [ ] Создан GitHub аккаунт
- [ ] Установлен Git на компьютер
- [ ] Создан новый репозиторий на GitHub
- [ ] Выполнены команды git в папке C:\Users\cobra\
- [ ] Файлы видны на GitHub
- [ ] Скопирована ссылка для коллег

---

## 📎 Итоговая ссылка для коллег

После всех шагов дайте коллегам эту ссылку:

```
https://github.com/YOUR_USERNAME/autonomera777-parser
```

Они смогут:
- Просмотреть код
- Скачать и использовать парсер локально
- Развернуть на своем сервере
- Сделать Fork и улучшить код

---

## 📚 Дополнительно

Подробное руководство: смотрите файл `DEPLOYMENT.md` для информации о развертывании на облаке.

---

**Готово! Ваш парсер теперь доступен всем на GitHub! 🎉**
