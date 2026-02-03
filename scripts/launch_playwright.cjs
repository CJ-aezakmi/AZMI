#!/usr/bin/env node
// CommonJS version of launch_playwright for bundled version
// Usage: node scripts/launch_playwright.cjs '<base64-encoded-json>'

const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// ВАЖНО: Определяем базовую директорию относительно расположения скрипта
// Скрипт находится в: appDir/scripts/launch_playwright.cjs
// Ресурсы находятся в: appDir/node, appDir/playwright
const scriptDir = __dirname;  // scripts/
const appDir = path.dirname(scriptDir);  // Parent directory

// Устанавливаем путь к Chromium браузеру
// ВАЖНО: Playwright сам добавляет chromium-1200 к пути!
// В dev режиме playwright-cache находится на 2 уровня выше
let chromiumCachePath = path.join(appDir, 'playwright-cache');
const devCachePath = path.join(appDir, '..', '..', 'playwright-cache');
if (fs.existsSync(devCachePath) && !fs.existsSync(chromiumCachePath)) {
  chromiumCachePath = devCachePath;
  console.log('[SCRIPT] Используется dev-режим с кешем из корневой папки');
}
process.env.PLAYWRIGHT_BROWSERS_PATH = chromiumCachePath;

console.log('[SCRIPT] Директория скрипта:', scriptDir);
console.log('[SCRIPT] Базовая директория приложения:', appDir);
console.log('[SCRIPT] PLAYWRIGHT_BROWSERS_PATH:', chromiumCachePath);
console.log('[SCRIPT] process.cwd():', process.cwd());

// Ищем Playwright в bundled директории
const playwrightPaths = [
  path.join(appDir, 'playwright', 'node_modules', 'playwright'),
  path.join(appDir, 'node_modules', 'playwright'),
  'playwright' // Fallback на глобальный
];

let chromium;
let playwrightPath = null;

for (const tryPath of playwrightPaths) {
  if (fs.existsSync(tryPath) || tryPath === 'playwright') {
    try {
      console.log('[SCRIPT] Пробуем загрузить Playwright из:', tryPath);
      const playwright = require(tryPath);
      chromium = playwright.chromium;
      playwrightPath = tryPath;
      console.log('[SCRIPT] ✅ Playwright загружен из:', tryPath);
      break;
    } catch (error) {
      console.log('[SCRIPT] ❌ Не удалось загрузить из:', tryPath, error.message);
    }
  }
}

if (!chromium) {
  console.error('[SCRIPT] КРИТИЧЕСКАЯ ОШИБКА: Playwright не найден!');
  console.error('[SCRIPT] Проверенные пути:', playwrightPaths);
  console.error('[SCRIPT] Переустановите приложение.');
  process.exit(1);
}

const { execSync } = require('child_process');
let ProxyChain = null;
let SocksClient = null;

// Попытка загрузить socks библиотеку
try {
  SocksClient = require('socks').SocksClient;
} catch (e) {
  // Библиотека не установлена
}

// Функция создания локального HTTP прокси для SOCKS
async function createSocksToHttpProxy(socksHost, socksPort, socksUsername, socksPassword) {
  if (!SocksClient) {
    throw new Error('Для SOCKS прокси требуется установить библиотеку: npm install socks');
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer();
    
    server.on('connect', async (req, clientSocket, head) => {
      const [hostname, port] = req.url.split(':');
      
      // Устанавливаем таймаут для клиентского сокета
      clientSocket.setTimeout(30000);
      
      try {
        const socksOptions = {
          proxy: {
            host: socksHost,
            port: parseInt(socksPort),
            type: 5,
            userId: socksUsername,
            password: socksPassword,
          },
          command: 'connect',
          destination: {
            host: hostname,
            port: parseInt(port),
          },
          timeout: 30000,  // 30 секунд таймаут
        };

        const info = await SocksClient.createConnection(socksOptions);
        
        // Устанавливаем таймаут и для SOCKS сокета
        info.socket.setTimeout(30000);
        info.socket.setKeepAlive(true, 60000);
        
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        
        // Обработка пайпинга с лучшей обработкой ошибок
        info.socket.pipe(clientSocket);
        clientSocket.pipe(info.socket);
        
        info.socket.on('error', (err) => {
          console.error('[SOCKS-PROXY] Ошибка SOCKS сокета:', err.message);
          try { clientSocket.destroy(); } catch(e) {}
        });
        
        info.socket.on('timeout', () => {
          console.warn('[SOCKS-PROXY] Таймаут SOCKS сокета');
          try { info.socket.destroy(); } catch(e) {}
          try { clientSocket.destroy(); } catch(e) {}
        });
        
        clientSocket.on('error', (err) => {
          console.error('[SOCKS-PROXY] Ошибка клиентского сокета:', err.message);
          try { info.socket.destroy(); } catch(e) {}
        });
        
        clientSocket.on('timeout', () => {
          console.warn('[SOCKS-PROXY] Таймаут клиентского сокета');
          try { clientSocket.destroy(); } catch(e) {}
          try { info.socket.destroy(); } catch(e) {}
        });
        
      } catch (err) {
        console.error('[SOCKS-PROXY] Ошибка подключения:', err.message);
        try {
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.end();
        } catch(e) {
          clientSocket.destroy();
        }
      }
    });

    server.on('error', (err) => {
      console.error('[SOCKS-PROXY] Ошибка сервера:', err.message);
      reject(err);
    });
    
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      console.log(`[SOCKS-PROXY] Локальный HTTP туннель запущен на 127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

// Auto-install Chromium if not present
// NOTE: Chromium уже включен в portable версию, не нужна установка!
async function ensureChromiumInstalled() {
  // Проверяем наличие Chromium в bundled директории
  try {
    // Сначала пытаемся получить путь от Playwright
    let executablePath;
    try {
      executablePath = chromium.executablePath();
    } catch (e) {
      // Если не удалось получить путь, пробуем установить браузеры
      console.log('[SCRIPT] Chromium не найден, устанавливаем...');
      
      try {
        const { execSync } = require('child_process');
        const installCmd = process.platform === 'win32' 
          ? 'npx playwright install chromium'
          : 'npx playwright install chromium';
        
        console.log('[SCRIPT] Выполняется команда:', installCmd);
        execSync(installCmd, { 
          stdio: 'inherit',
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: chromiumCachePath }
        });
        
        console.log('[SCRIPT] ✅ Chromium успешно установлен!');
        executablePath = chromium.executablePath();
      } catch (installErr) {
        console.error('[SCRIPT] Ошибка установки Chromium:', installErr.message);
        throw new Error('Не удалось установить Chromium автоматически');
      }
    }
    
    if (fs.existsSync(executablePath)) {
      console.log('[SCRIPT] ✅ Chromium найден:', executablePath);
      return;
    }
    
    throw new Error('Chromium не найден после установки');
  } catch (e) {
    console.error('[SCRIPT] ❌ ОШИБКА: Chromium не найден!');
    console.error('[SCRIPT] Детали:', e.message);
    throw new Error('Chromium browser не найден. Попробуйте переустановить приложение.');
  }
}

async function main() {
  try {
    const argv = process.argv.slice(2 || 0);
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log('Usage: node scripts/launch_playwright.cjs <base64-payload>');
      console.log('       node scripts/launch_playwright.cjs --dry-run');
      console.log('Options:\n  --dry-run    Run smoke test and exit 0 without launching browser\n  --help,-h    Show this help');
      process.exit(0);
    }

    if (argv.includes('--dry-run')) {
      console.log('Dry-run OK (no payload required)');
      process.exit(0);
    }

    // Ensure Chromium is installed before launching
    await ensureChromiumInstalled();

    const payloadB64 = argv[0];
    if (!payloadB64) {
      throw new Error('Missing payload argument (or use --dry-run)');
    }

    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const payload = JSON.parse(json);

    const profileDir = payload.profileDir || `./playwright-profile-${Date.now()}`;
    let args = payload.args || [];
    args = args.filter(a => !a.startsWith('--user-data-dir'));
    args = args.filter(a => !a.startsWith('--proxy-server'));
    args = args.filter(a => !a.startsWith('--host-resolver-rules'));
    const url = payload.url || 'https://www.google.com';

    const launchOptions = { headless: false, args: [...args] };

    let anonymizedProxy = null;
    let socksProxyServer = null;
    
    if (payload.proxy && payload.proxy.server) {
      const { server, username, password } = payload.proxy;
      
      console.log('[SCRIPT] Настройка прокси:', { server, hasAuth: !!(username && password) });
      
      // Определяем тип прокси
      const isSocks = server.toLowerCase().includes('socks');
      const hasAuth = !!(username && password);
      
      // SOCKS прокси (с авторизацией или без) - создаем локальный HTTP туннель
      if (isSocks) {
        try {
          // Парсим SOCKS URL
          let socksHost, socksPort, socksUser, socksPass;
          
          if (server.includes('://')) {
            const url = new URL(server);
            socksHost = url.hostname;
            socksPort = url.port || '1080';
            socksUser = username || url.username || undefined;
            socksPass = password || url.password || undefined;
          } else {
            // Формат: host:port
            const parts = server.split(':');
            socksHost = parts[0];
            socksPort = parts[1] || '1080';
            socksUser = username;
            socksPass = password;
          }
          
          console.log(`[SCRIPT] Создание HTTP туннеля для SOCKS прокси ${socksHost}:${socksPort}...`);
          
          const proxyInfo = await createSocksToHttpProxy(socksHost, socksPort, socksUser, socksPass);
          socksProxyServer = proxyInfo.server;
          
          const localProxyUrl = `http://127.0.0.1:${proxyInfo.port}`;
          console.log('[SCRIPT] ✅ SOCKS туннель готов:', localProxyUrl);
          
          launchOptions.proxy = { server: localProxyUrl };
        } catch (e) {
          console.error('[SCRIPT] Ошибка создания SOCKS туннеля:', e.message);
          throw new Error(`Не удалось настроить SOCKS прокси: ${e.message}`);
        }
      }
      // HTTP/HTTPS прокси с авторизацией - используем proxy-chain
      else if (!isSocks && hasAuth) {
        try {
          ProxyChain = require('proxy-chain');
        } catch (impErr) {
          throw new Error('Для HTTP прокси с авторизацией требуется установить proxy-chain: npm install proxy-chain');
        }
        
        try {
          // Формируем правильный HTTP URL с авторизацией
          let proxyUrl = server;
          
          // Если URL не содержит авторизацию, добавляем её
          if (!proxyUrl.includes('@')) {
            // Убеждаемся, что это HTTP URL
            if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
              proxyUrl = 'http://' + proxyUrl;
            }
            
            const urlObj = new URL(proxyUrl);
            urlObj.username = encodeURIComponent(username);
            urlObj.password = encodeURIComponent(password);
            proxyUrl = urlObj.toString();
          }
          
          console.log('[SCRIPT] Анонимизация HTTP прокси через proxy-chain...');
          anonymizedProxy = await ProxyChain.anonymizeProxy(proxyUrl);
          console.log('[SCRIPT] Прокси анонимизирован:', anonymizedProxy);
          
          launchOptions.proxy = { server: anonymizedProxy };
        } catch (e) {
          console.error('[SCRIPT] Ошибка анонимизации прокси:', e.message);
          throw new Error(`Не удалось настроить прокси: ${e.message}`);
        }
      }
      // HTTP/HTTPS без авторизации - используем напрямую
      else {
        console.log('[SCRIPT] Используется HTTP прокси без авторизации');
        launchOptions.proxy = { server };
      }
    }

    // Добавляем антидетект аргументы
    const stealthArgs = [
      '--disable-blink-features=AutomationControlled',  // Скрывает navigator.webdriver
      '--disable-features=UserAgentClientHint',  // Убирает новые CH API
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--mute-audio',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-features=TranslateUI',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
      '--disable-features=VizDisplayCompositor',
    ];
    
    // Объединяем с пользовательскими аргументами
    launchOptions.args = [...stealthArgs, ...launchOptions.args];

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: launchOptions.headless,
      args: launchOptions.args,
      proxy: launchOptions.proxy,
      ignoreDefaultArgs: ['--enable-automation'],  // Убираем automation флаг
      // Настройки viewport для реалистичности
      viewport: null,  // Используем размер окна браузера
    });

    const page = context.pages().length ? context.pages()[0] : await context.newPage();
    
    // Инжектим антидетект скрипты ПЕРЕД загрузкой страницы
    await page.addInitScript(() => {
      // Удаляем webdriver флаг
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Удаляем __webdriver_script_fn
      delete navigator.__webdriver_script_fn;
      
      // Подменяем permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Подменяем plugins для реалистичности
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin"
          },
          {
            0: { type: "application/pdf", suffixes: "pdf", description: "" },
            description: "",
            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
            length: 1,
            name: "Chrome PDF Viewer"
          },
          {
            0: { type: "application/x-nacl", suffixes: "", description: "Native Client Executable" },
            1: { type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable" },
            description: "",
            filename: "internal-nacl-plugin",
            length: 2,
            name: "Native Client"
          }
        ]
      });
      
      // Скрываем chrome-specific свойства
      delete navigator.__proto__.webdriver;
      
      // Подменяем languages для реалистичности
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en']
      });
      
      // Добавляем реалистичный Chrome runtime
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
      
      // Переопределяем toString чтобы скрыть proxy
      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === window.navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return originalToString.apply(this, arguments);
      };
      
      // Скрываем headless-специфичные свойства
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 1  // Эмулируем тач-поддержку
      });
      
      // Подменяем battery API
      if (navigator.getBattery) {
        const originalGetBattery = navigator.getBattery;
        navigator.getBattery = () => {
          return Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 0.95,
            addEventListener: () => {},
            removeEventListener: () => {},
          });
        };
      }
      
      // Блокируем WebRTC IP leak
      if (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection) {
        const originalRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        window.RTCPeerConnection = function(...args) {
          const pc = new originalRTC(...args);
          // Блокируем получение локальных IP
          const originalAddIceCandidate = pc.addIceCandidate;
          pc.addIceCandidate = function(candidate) {
            if (candidate && candidate.candidate && candidate.candidate.includes('.local')) {
              return Promise.resolve();
            }
            return originalAddIceCandidate.apply(this, arguments);
          };
          return pc;
        };
        window.RTCPeerConnection.prototype = originalRTC.prototype;
      }
      
      // Подменяем deviceMemory для реалистичности
      if (navigator.deviceMemory) {
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8
        });
      }
      
      // Подменяем hardwareConcurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
      });
      
      // Подменяем platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });
      
      // Убираем Headless из userAgent если есть
      const originalUserAgent = navigator.userAgent;
      if (originalUserAgent.includes('Headless')) {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => originalUserAgent.replace('Headless', '')
        });
      }
      
      // Canvas Fingerprint защита
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      
      // Добавляем шум к canvas
      const noisify = function(canvas, context) {
        const shift = {
          'r': Math.floor(Math.random() * 10) - 5,
          'g': Math.floor(Math.random() * 10) - 5,
          'b': Math.floor(Math.random() * 10) - 5,
          'a': Math.floor(Math.random() * 10) - 5
        };
        
        const width = canvas.width;
        const height = canvas.height;
        if (width && height) {
          const imageData = originalGetImageData.apply(context, [0, 0, width, height]);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i + 0] = imageData.data[i + 0] + shift.r;
            imageData.data[i + 1] = imageData.data[i + 1] + shift.g;
            imageData.data[i + 2] = imageData.data[i + 2] + shift.b;
            imageData.data[i + 3] = imageData.data[i + 3] + shift.a;
          }
          context.putImageData(imageData, 0, 0);
        }
      };
      
      HTMLCanvasElement.prototype.toDataURL = function() {
        noisify(this, this.getContext('2d'));
        return originalToDataURL.apply(this, arguments);
      };
      
      HTMLCanvasElement.prototype.toBlob = function() {
        noisify(this, this.getContext('2d'));
        return originalToBlob.apply(this, arguments);
      };
      
      // Audio context fingerprint защита
      const audioContext = window.AudioContext || window.webkitAudioContext;
      if (audioContext) {
        const originalCreateAnalyser = audioContext.prototype.createAnalyser;
        audioContext.prototype.createAnalyser = function() {
          const analyser = originalCreateAnalyser.apply(this, arguments);
          const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
          analyser.getFloatFrequencyData = function(array) {
            originalGetFloatFrequencyData.apply(this, arguments);
            for (let i = 0; i < array.length; i++) {
              array[i] = array[i] + Math.random() * 0.0001;
            }
          };
          return analyser;
        };
      }
      
      // Устанавливаем Яндекс как поисковик по умолчанию
      if (window.location.hostname === 'newtab' || window.location.href === 'chrome://newtab/') {
        window.location.href = 'https://ya.ru';
      }
    });

    page.on('requestfailed', (req) => {
      try { console.warn('[requestfailed]', req.url(), req.failure()?.errorText); } catch(e){}
    });

    try { await page.goto(url, { waitUntil: 'load', timeout: 60000 }); } catch (err) { console.warn('page.goto failed:', err && err.message ? err.message : err); }

    try {
      const ip = await page.evaluate(() => fetch('https://api.ipify.org').then(r => r.text()).catch(() => null));
      if (ip) console.debug('browser-seen IP:', ip);
    } catch (e) {}

    console.debug('Playwright launched; waiting for browser to close...');
    try { await context.waitForEvent('close', { timeout: 0 }); } catch (err) {}
    try { await context.close(); } catch (err) {}

    // Закрываем прокси серверы
    if (anonymizedProxy && ProxyChain && ProxyChain.closeAnonymizedProxy) {
      try { await ProxyChain.closeAnonymizedProxy(anonymizedProxy); } catch (e) {}
    }
    
    if (socksProxyServer) {
      try { 
        socksProxyServer.close();
        console.log('[SCRIPT] SOCKS туннель закрыт');
      } catch (e) {}
    }

    // Успешный запуск - тихо завершаем
  } catch (err) {
    console.error('❌ Ошибка запуска профиля:', err.message);
    process.exit(1);
  }
}

main();
