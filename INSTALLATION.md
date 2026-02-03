# 🚀 Установка и Настройка AEZAKMI Pro v2.0

## 📋 Системные Требования

### Минимальные
- **OS:** Windows 10/11 (64-bit), macOS 10.15+, Linux (Ubuntu 20.04+)
- **RAM:** 4 GB
- **Disk:** 2 GB свободного места
- **Node.js:** 18.x или выше

### Рекомендуемые
- **RAM:** 8 GB или больше
- **Disk:** 5 GB (для кэша браузеров)
- **CPU:** 4 ядра или больше

## 🛠️ Установка

### 1. Установка Node.js

#### Windows
1. Скачайте установщик с [nodejs.org](https://nodejs.org/)
2. Запустите установщик и следуйте инструкциям
3. Проверьте установку:
```powershell
node --version
npm --version
```

#### macOS
```bash
# Через Homebrew
brew install node@18

# Или скачайте с nodejs.org
```

#### Linux
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка
node --version
npm --version
```

### 2. Установка Зависимостей

```bash
cd разработка/aezakmi

# Установка зависимостей
pnpm install
# или
npm install

# Установка Playwright браузеров
pnpm playwright install chromium firefox
# или
npx playwright install chromium firefox
```

### 3. Установка proxy-chain (для поддержки прокси с авторизацией)

```bash
pnpm add proxy-chain
# или
npm install proxy-chain
```

### 4. Запуск Приложения

#### Режим Разработки
```bash
# Frontend + Backend
pnpm dev
# или
npm run dev
```

#### Production Build
```bash
# Build приложения
pnpm build
pnpm tauri:build

# Запуск
./target/release/AEZAKMI_Pro
```

## ⚙️ Конфигурация

### Настройка Playwright

Создайте файл `.env` в корне проекта:

```env
# Playwright settings
PLAYWRIGHT_BROWSERS_PATH=./playwright-cache

# Development mode
DEBUG=pw:api
```

### Настройка Прокси-Туннеля

По умолчанию `proxy-chain` автоматически создает локальные туннели для прокси с авторизацией. Настройка не требуется.

Для продвинутых пользователей:

```javascript
// scripts/advanced-antidetect-launcher.js
class ProxyTunnel {
  constructor() {
    this.tunnels = new Map();
    // Настройте порты
    this.portRange = { min: 30000, max: 40000 };
  }
}
```

## 🔧 Настройка Антидетекта

### Глобальные Настройки

Отредактируйте `scripts/advanced-antidetect-launcher.js`:

```javascript
const ANTIDETECT_CONFIG = {
  canvas: {
    noise: true,
    noiseLevel: 0.1, // 0.1 - 1.0
  },
  webgl: {
    noise: true,
    vendor: 'Intel Inc.',
    renderer: 'Intel Iris OpenGL Engine',
  },
  audio: {
    noise: true,
    contextNoise: 0.001,
  },
  webrtc: {
    block: true,
    replacePublicIP: true,
    replaceLocalIP: true,
  },
};
```

### Настройка на Профиль

Параметры антидетекта можно настраивать индивидуально для каждого профиля через UI.

## 📦 Установка Camoufox (Опционально)

### Автоматическая Установка (Рекомендуется)

```bash
# Скрипт установки Camoufox будет добавлен в будущих версиях
pnpm run install:camoufox
```

### Ручная Установка

1. Скачайте Camoufox с [releases](https://github.com/daijro/camoufox/releases)
2. Распакуйте в `./camoufox/`
3. Укажите путь в профиле:

```typescript
{
  browserEngine: "camoufox",
  camoufoxPath: "./camoufox/camoufox.exe", // Windows
  // или
  camoufoxPath: "./camoufox/camoufox", // Linux/macOS
}
```

## 🐛 Отладка

### Включение Debug Режима

#### Playwright Debug
```bash
# Linux/macOS
DEBUG=pw:api pnpm dev

# Windows PowerShell
$env:DEBUG="pw:api"
pnpm dev
```

#### Antidetect Debug
Отредактируйте `scripts/advanced-antidetect-launcher.js`:

```javascript
console.log('[DEBUG] Fingerprint:', fingerprint);
console.log('[DEBUG] Antidetect config:', antidetectConfig);
console.log('[DEBUG] Proxy config:', proxyConfig);
```

### Логи в Browser Console

```javascript
// Откройте DevTools в запущенном профиле (F12)
console.log('[ANTIDETECT] Защита активирована');
```

### Проверка Proxy Tunnel

```bash
# В терминале будут видны логи туннеля
[PROXY] Туннель создан: http://127.0.0.1:35421 -> socks5://proxy.com:1080
[PROXY] Туннель закрыт: http://127.0.0.1:35421
```

## 🔐 Безопасность

### Хранение Данных

Профили хранятся локально:
```
Windows: C:\Users\<user>\AppData\Roaming\aezakmi\profiles\
macOS: ~/Library/Application Support/aezakmi/profiles/
Linux: ~/.config/aezakmi/profiles/
```

### Шифрование

Для шифрования профилей используйте:

```typescript
// Будет добавлено в будущих версиях
import { encryptProfile, decryptProfile } from '@/lib/encryption';

const encrypted = encryptProfile(profile, 'your-password');
const decrypted = decryptProfile(encrypted, 'your-password');
```

## 📊 Производительность

### Оптимизация Памяти

По умолчанию каждый профиль использует ~300-500 MB RAM. Для оптимизации:

```javascript
// scripts/advanced-antidetect-launcher.js
const args = [
  '--js-flags=--max-old-space-size=512', // Ограничить память
  '--disable-gpu',                        // Отключить GPU (для серверов)
];
```

### Очистка Кэша

```bash
# Удалить кэш браузеров
rm -rf ./playwright-cache/*

# Удалить профили
rm -rf ~/.config/aezakmi/profiles/*
```

## 🔄 Обновление

### Обновление Зависимостей

```bash
pnpm update
pnpm playwright install chromium firefox --force
```

### Обновление Приложения

```bash
git pull origin main
pnpm install
pnpm build
```

## 🆘 Частые Проблемы

### Проблема: "Node.js не найден"
**Решение:**
```bash
# Убедитесь что Node.js в PATH
node --version

# Windows: добавьте в PATH
# C:\Program Files\nodejs\
```

### Проблема: "Playwright browsers not found"
**Решение:**
```bash
pnpm playwright install chromium firefox
```

### Проблема: "Proxy connection failed"
**Решение:**
1. Проверьте формат прокси
2. Убедитесь что прокси работает:
```bash
curl --proxy socks5://user:pass@host:port https://api.ipify.org
```

### Проблема: "Canvas fingerprint detected"
**Решение:**
1. Увеличьте `noiseLevel` до 0.5-1.0
2. Используйте Camoufox вместо Chromium
3. Проверьте на разных сайтах детекции

### Проблема: "Too many open files"
**Решение (Linux/macOS):**
```bash
ulimit -n 4096
```

## 📖 Дополнительные Ресурсы

- [Документация по Антидетекту](ADVANCED_ANTIDETECT.md)
- [Руководство по Прокси](PROXY_GUIDE.md)
- [Troubleshooting Guide](PROXY_TROUBLESHOOTING.md)
- [Testing Guide](TESTING_GUIDE.md)

## 💬 Поддержка

При возникновении проблем:
1. Проверьте логи в консоли
2. Прочитайте документацию
3. Создайте issue на GitHub с подробным описанием проблемы

---

**Важно:** После установки всех компонентов, протестируйте профили на:
- [whoer.net](https://whoer.net)
- [browserleaks.com](https://browserleaks.com)
- [pixelscan.net](https://pixelscan.net)

Если score > 95%, значит антидетект работает корректно! ✅
