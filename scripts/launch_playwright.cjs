#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// AEZAKMI Antidetect Browser Launcher v2.1.0
// Unified launcher: multi-engine (Chromium/Firefox/WebKit) + mobile fingerprints
// Usage: node scripts/launch_playwright.cjs '<base64-encoded-json>'
// ═══════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// ─── PRODUCTION MODE ──────────────────────────────────────────────────
// Проверяем production режим (если нет node_modules рядом = production)
const isDev = fs.existsSync(path.join(__dirname, '..', 'node_modules'));
const log = isDev ? console.log.bind(console) : () => {};
const warn = isDev ? console.warn.bind(console) : () => {};
const error = console.error.bind(console); // Errors всегда показываем

// ─── PATH RESOLUTION ──────────────────────────────────────────────────
const scriptDir = __dirname;
const appDir = path.dirname(scriptDir);

// PLAYWRIGHT_BROWSERS_PATH: приоритет — значение от Rust (через env),
// потом %LOCALAPPDATA%, потом fallback рядом с exe
let browserCachePath = process.env.PLAYWRIGHT_BROWSERS_PATH || '';

if (!browserCachePath || !fs.existsSync(browserCachePath)) {
  // Пробуем %LOCALAPPDATA%/AEZAKMI Pro/playwright-cache (production путь)
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const localCachePath = path.join(localAppData, 'AEZAKMI Pro', 'playwright-cache');
    if (fs.existsSync(localCachePath)) {
      browserCachePath = localCachePath;
      log('[LAUNCHER] Кеш из LOCALAPPDATA:', browserCachePath);
    }
  }
}

if (!browserCachePath || !fs.existsSync(browserCachePath)) {
  // Dev mode: ищем в корне проекта (2 уровня вверх от scripts/)
  const devCachePath = path.join(appDir, '..', '..', 'playwright-cache');
  if (fs.existsSync(devCachePath)) {
    browserCachePath = devCachePath;
    log('[LAUNCHER] Dev-режим: кеш из корневой папки');
  } else {
    // Крайний fallback: рядом с exe
    browserCachePath = path.join(appDir, 'playwright-cache');
  }
}

process.env.PLAYWRIGHT_BROWSERS_PATH = browserCachePath;

log('[LAUNCHER] Скрипт:', scriptDir);
log('[LAUNCHER] Приложение:', appDir);
log('[LAUNCHER] Кеш браузеров:', browserCachePath);
log('[LAUNCHER] Кеш существует:', fs.existsSync(browserCachePath));

// ─── LOAD PLAYWRIGHT ──────────────────────────────────────────────────
const playwrightPaths = [
  path.join(appDir, 'playwright', 'modules', 'playwright'),       // Production: modules/ (renamed from node_modules)
  path.join(appDir, 'playwright', 'node_modules', 'playwright'),  // Dev/fallback
  path.join(appDir, 'node_modules', 'playwright'),                // Alt fallback
  'playwright'                                                     // System
];

let playwright = null;
for (const tryPath of playwrightPaths) {
  if (fs.existsSync(tryPath) || tryPath === 'playwright') {
    try {
      playwright = require(tryPath);
      log('[LAUNCHER] ✅ Playwright загружен из:', tryPath);
      break;
    } catch (err) {
      log('[LAUNCHER] ❌ Не удалось загрузить из:', tryPath, err.message);
    }
  }
}

if (!playwright) {
  error('[LAUNCHER] КРИТИЧЕСКАЯ ОШИБКА: Playwright не найден!');
  process.exit(1);
}

let ProxyChain = null;
let SocksClient = null;
try { SocksClient = require('socks').SocksClient; } catch (e) { }

// ─── SOCKS PROXY TUNNEL ──────────────────────────────────────────────
async function createSocksToHttpProxy(socksHost, socksPort, socksUsername, socksPassword) {
  if (!SocksClient) {
    throw new Error('Для SOCKS прокси требуется библиотека socks');
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('connect', async (req, clientSocket) => {
      const [hostname, port] = req.url.split(':');
      clientSocket.setTimeout(30000);
      try {
        const info = await SocksClient.createConnection({
          proxy: { host: socksHost, port: parseInt(socksPort), type: 5, userId: socksUsername, password: socksPassword },
          command: 'connect',
          destination: { host: hostname, port: parseInt(port) },
          timeout: 30000,
        });
        info.socket.setTimeout(30000);
        info.socket.setKeepAlive(true, 60000);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        info.socket.pipe(clientSocket);
        clientSocket.pipe(info.socket);
        info.socket.on('error', () => { try { clientSocket.destroy(); } catch (e) { } });
        clientSocket.on('error', () => { try { info.socket.destroy(); } catch (e) { } });
      } catch (err) {
        error('[SOCKS] Ошибка:', err.message);
        try { clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (e) { clientSocket.destroy(); }
      }
    });
    server.on('request', (req, res) => {
      const options = {
        host: socksHost, port: parseInt(socksPort), path: req.url, method: req.method,
        headers: { ...req.headers }
      };
      const proxyReq = http.request(options, (proxyRes) => { res.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(res); });
      proxyReq.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(proxyReq);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      log(`[SOCKS] Туннель: 127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

// ─── REAL IP & GEOIP DETECTION ─────────────────────────────────────────
/**
 * Получить реальный исходящий IP через SOCKS прокси напрямую
 * Обходит проблемы с HTTP туннелями и 407 ошибками
 */
async function getRealIPThroughProxy(proxyConfig, tunnelUrl) {
  return new Promise((resolve, reject) => {
    const socks = require('socks').SocksClient;
    
    // Парсим SOCKS прокси из proxyConfig.server
    const socksUrl = new URL(proxyConfig.server); // socks5://89.38.99.242:9999
    
    const socksOptions = {
      proxy: {
        host: socksUrl.hostname,
        port: Number(socksUrl.port),
        type: 5,
        userId: proxyConfig.username || '',
        password: proxyConfig.password || ''
      },
      command: 'connect',
      destination: {
        host: 'api.ipify.org',
        port: 80
      }
    };
    
    log('[LAUNCHER] 🔌 Прямое SOCKS соединение:', {
      proxyHost: socksUrl.hostname,
      proxyPort: socksUrl.port,
      hasAuth: !!(proxyConfig.username && proxyConfig.password),
      target: 'api.ipify.org:80'
    });
    
    socks.createConnection(socksOptions, (err, info) => {
      if (err) {
        error('[LAUNCHER] ❌ SOCKS ошибка:', err.message);
        reject(new Error('SOCKS connection failed: ' + err.message));
        return;
      }
      
      const socket = info.socket;
      log('[LAUNCHER] ✅ SOCKS туннель создан, отправка HTTP запроса...');
      
      let data = '';
      let resolved = false;
      let timeoutHandle;
      
      // Делаем HTTP запрос через SOCKS socket
      const request = [
        'GET /?format=text HTTP/1.1',
        'Host: api.ipify.org',
        'User-Agent: Mozilla/5.0',
        'Accept: text/plain',
        'Connection: close',
        '',
        ''
      ].join('\r\n');
      
      socket.setEncoding('utf8');
      
      socket.on('data', (chunk) => {
        data += chunk;
        log('[LAUNCHER] 📦 Получены данные, размер:', chunk.length, 'байт');
        
        // Пытаемся распарсить ответ, как только появляется тело
        if (!resolved && data.includes('\r\n\r\n')) {
          const bodyStartIndex = data.indexOf('\r\n\r\n');
          const headers = data.substring(0, bodyStartIndex);
          const body = data.substring(bodyStartIndex + 4).trim();
          
          const statusLine = headers.split('\r\n')[0];
          log('[LAUNCHER] HTTP Status:', statusLine);
          
          if (statusLine.includes('200')) {
            // Извлекаем IP из body
            const ipMatch = body.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (ipMatch) {
              const ip = ipMatch[1];
              log('[LAUNCHER] 🎯 Извлечен IP:', ip);
              resolved = true;
              clearTimeout(timeoutHandle);
              socket.destroy();
              resolve(ip);
            }
          }
        }
      });
      
      socket.on('end', () => {
        log('[LAUNCHER] 🔌 Socket закрыт, всего получено:', data.length, 'байт');
        if (!resolved) {
          reject(new Error('Connection closed without valid IP'));
        }
      });
      
      socket.on('error', (err) => {
        error('[LAUNCHER] ❌ Socket error:', err.message);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutHandle);
          reject(new Error('Socket error: ' + err.message));
        }
      });
      
      // Таймаут увеличен до 15 секунд
      timeoutHandle = setTimeout(() => {
        if (!resolved) {
          error('[LAUNCHER] ⏱️ Таймаут! Получено данных:', data.length);
          socket.destroy();
          reject(new Error('Timeout: api.ipify.org не ответил за 15 секунд'));
        }
      }, 15000);
      
      socket.write(request);
    });
  });
}

/**
 * Получить GeoIP информацию (timezone, язык) по IP адресу
 */
async function getGeoIPInfoFromIP(ip) {
  return new Promise((resolve, reject) => {
    const url = `http://ip-api.com/json/${ip}?fields=status,country,countryCode,timezone`;

    http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            const language = getLanguageByCountryCode(json.countryCode);
            resolve({
              country: json.country,
              countryCode: json.countryCode,
              timezone: json.timezone || 'UTC',
              language: language
            });
          } else {
            reject(new Error('GeoIP API вернул ошибку'));
          }
        } catch (error) {
          reject(new Error('Ошибка парсинга GeoIP ответа'));
        }
      });
    }).on('error', (error) => {
      reject(new Error('Ошибка GeoIP запроса: ' + error.message));
    }).on('timeout', () => {
      reject(new Error('Таймаут GeoIP запроса'));
    });
  });
}

/**
 * Определить язык по коду страны
 */
function getLanguageByCountryCode(code) {
  const map = {
    'US': 'en-US', 'GB': 'en-GB', 'CA': 'en-CA', 'AU': 'en-AU',
    'RU': 'ru-RU', 'UA': 'uk-UA', 'BY': 'be-BY', 'KZ': 'kk-KZ',
    'DE': 'de-DE', 'FR': 'fr-FR', 'ES': 'es-ES', 'IT': 'it-IT',
    'CN': 'zh-CN', 'JP': 'ja-JP', 'KR': 'ko-KR', 'IN': 'hi-IN',
    'BR': 'pt-BR', 'MX': 'es-MX', 'AR': 'es-AR', 'NL': 'nl-NL',
    'SE': 'sv-SE', 'NO': 'no-NO', 'DK': 'da-DK', 'FI': 'fi-FI',
    'PL': 'pl-PL', 'CZ': 'cs-CZ', 'TR': 'tr-TR', 'GR': 'el-GR',
    'TH': 'th-TH', 'VN': 'vi-VN', 'ID': 'id-ID', 'MY': 'ms-MY',
    'SG': 'en-SG', 'PH': 'en-PH', 'AE': 'ar-AE', 'SA': 'ar-SA',
    'IL': 'he-IL', 'ZA': 'en-ZA', 'EG': 'ar-EG', 'NG': 'en-NG',
    'NZ': 'en-NZ', 'PT': 'pt-PT', 'CH': 'de-CH'
  };
  return map[code] || 'en-US';
}

// ─── BROWSER ENGINE RESOLVER ──────────────────────────────────────────
function getBrowserEngine(engineName) {
  // Используем только Chromium — максимальная стабильность и совместимость
  return { engine: playwright.chromium, name: 'chromium', isChromium: true, isFirefox: false, isWebKit: false };
}

// ─── ENSURE BROWSER INSTALLED ─────────────────────────────────────────
async function ensureBrowserInstalled(browserInfo) {
  try {
    const execPath = browserInfo.engine.executablePath();
    if (fs.existsSync(execPath)) {
      log(`[LAUNCHER] ✅ ${browserInfo.name} найден:`, execPath);
      return;
    }
    throw new Error('not found');
  } catch (e) {
    log(`[LAUNCHER] ${browserInfo.name} не найден, устанавливаем...`);
    try {
      const { execSync } = require('child_process');
      execSync(`npx playwright install ${browserInfo.name}`, {
        stdio: 'inherit',
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserCachePath }
      });
      log(`[LAUNCHER] ✅ ${browserInfo.name} установлен!`);
    } catch (installErr) {
      throw new Error(`Не удалось установить ${browserInfo.name}: ${installErr.message}`);
    }
  }
}

// ─── CHROMIUM STEALTH ARGS ────────────────────────────────────────────
function getChromiumStealthArgs() {
  return [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=UserAgentClientHint',
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
    // Минимизация DNS leak через DNS over HTTPS
    '--enable-features=DnsOverHttps',
    '--dns-over-https-server=https://1.1.1.1/dns-query',
  ];
}

// ─── ANTIDETECT INIT SCRIPT (DESKTOP) ─────────────────────────────────
function buildDesktopAntidetectScript(payload) {
  const ad = payload.antidetect || {};
  const hwConcurrency = ad.hardwareConcurrency || 8;
  const devMemory = ad.deviceMemory || 8;
  const osName = (payload.os || 'windows').toLowerCase();
  const browserType = (payload.browserType || 'chromium').toLowerCase();
  const isChromium = browserType === 'chromium' || browserType === 'webkit';

  let platform = 'Win32';
  if (osName === 'macos') platform = 'MacIntel';
  else if (osName === 'linux') platform = 'Linux x86_64';

  return `
    // ═══ AEZAKMI Desktop Antidetect v2.1.0 ═══
    
    // Удаляем webdriver флаг
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    try { delete navigator.__webdriver_script_fn; } catch(e) {}
    try { delete navigator.__proto__.webdriver; } catch(e) {}
    
    // Permissions API
    const _origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (p) => (
      p.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : _origQuery(p)
    );
    
    // Platform
    Object.defineProperty(navigator, 'platform', { get: () => '${platform}' });
    
    // Hardware
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${hwConcurrency} });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => ${devMemory} });
    
    // Touch points (desktop = 0)
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
    
    ${isChromium ? `
    // Chrome plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const p = [
          { 0: {type:"application/x-google-chrome-pdf",suffixes:"pdf",description:"PDF"}, description:"PDF", filename:"internal-pdf-viewer", length:1, name:"Chrome PDF Plugin" },
          { 0: {type:"application/pdf",suffixes:"pdf",description:""}, description:"", filename:"mhjfbmdgcfjbbpaeojofohoefgiehjai", length:1, name:"Chrome PDF Viewer" },
        ];
        p.length = 2;
        p.item = (i) => p[i] || null;
        p.namedItem = (n) => p.find(x => x.name === n) || null;
        p.refresh = () => {};
        return p;
      }
    });
    
    // Chrome runtime
    window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
    ` : ''}
    
    // Languages
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU','ru','en-US','en'] });
    
    // Hide toString proxy
    const _origToStr = Function.prototype.toString;
    Function.prototype.toString = function() {
      if (this === window.navigator.permissions.query) return 'function query() { [native code] }';
      return _origToStr.apply(this, arguments);
    };
    
    // Battery API (desktop)
    if (navigator.getBattery) {
      navigator.getBattery = () => Promise.resolve({
        charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0,
        addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true,
        onchargingchange: null, onchargingtimechange: null, ondischargingtimechange: null, onlevelchange: null,
      });
    }
    
    // WebRTC protection
    ${ad.webrtc?.block !== false ? `
    if (window.RTCPeerConnection) {
      const _RTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function(...args) {
        const pc = new _RTC(...args);
        const _addIce = pc.addIceCandidate;
        pc.addIceCandidate = function(c) {
          if (c && c.candidate && c.candidate.includes('.local')) return Promise.resolve();
          return _addIce.apply(this, arguments);
        };
        return pc;
      };
      window.RTCPeerConnection.prototype = _RTC.prototype;
    }
    ` : ''}
    
    // Canvas noise
    ${ad.canvas?.noise !== false ? `
    (function() {
      const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
      const _toBlob = HTMLCanvasElement.prototype.toBlob;
      const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
      const shift = { r: Math.floor(Math.random()*10)-5, g: Math.floor(Math.random()*10)-5, b: Math.floor(Math.random()*10)-5, a: Math.floor(Math.random()*10)-5 };
      function addNoise(canvas, ctx) {
        if (!canvas.width || !canvas.height) return;
        try {
          const d = _getImageData.call(ctx, 0, 0, canvas.width, canvas.height);
          for (let i = 0; i < d.data.length; i += 4) { d.data[i]+=shift.r; d.data[i+1]+=shift.g; d.data[i+2]+=shift.b; d.data[i+3]+=shift.a; }
          ctx.putImageData(d, 0, 0);
        } catch(e) {}
      }
      HTMLCanvasElement.prototype.toDataURL = function() { try { addNoise(this, this.getContext('2d')); } catch(e) {} return _toDataURL.apply(this, arguments); };
      HTMLCanvasElement.prototype.toBlob = function() { try { addNoise(this, this.getContext('2d')); } catch(e) {} return _toBlob.apply(this, arguments); };
    })();
    ` : ''}
    
    // Audio noise
    ${ad.audio?.noise !== false ? `
    (function() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const _createAnalyser = AC.prototype.createAnalyser;
      AC.prototype.createAnalyser = function() {
        const an = _createAnalyser.apply(this, arguments);
        const _getFloat = an.getFloatFrequencyData;
        an.getFloatFrequencyData = function(arr) { _getFloat.apply(this, arguments); for(let i=0;i<arr.length;i++) arr[i]+=Math.random()*0.0001; };
        return an;
      };
    })();
    ` : ''}
    
    // UserAgent cleanup
    const _ua = navigator.userAgent;
    if (_ua.includes('Headless')) {
      Object.defineProperty(navigator, 'userAgent', { get: () => _ua.replace('Headless','') });
    }
  `;
}

// ─── MOBILE FINGERPRINT INJECTION ─────────────────────────────────────
function buildMobileAntidetectScript(payload) {
  const mobile = payload.mobileEmulation || {};
  const ad = payload.antidetect || {};
  const deviceName = mobile.deviceName || 'Generic Mobile';
  const isIOS = deviceName.toLowerCase().includes('iphone') || deviceName.toLowerCase().includes('ipad');
  const isAndroid = !isIOS;
  const touchPoints = mobile.hasTouch ? 5 : 0;
  const dpr = mobile.deviceScaleFactor || 3;
  const screenW = mobile.width || 390;
  const screenH = mobile.height || 844;
  const mobileUA = mobile.userAgent || payload.userAgent || '';
  const hwConcurrency = isIOS ? 6 : (ad.hardwareConcurrency || 4);
  const devMemory = isIOS ? 4 : (ad.deviceMemory || 4);
  const browserType = (payload.browserType || 'chromium').toLowerCase();
  const isChromium = browserType === 'chromium' || browserType === 'webkit';

  let platform = isIOS ? (deviceName.includes('iPad') ? 'iPad' : 'iPhone') : 'Linux armv81';

  return `
    // ═══ AEZAKMI Mobile Fingerprint v2.1.0 ═══
    // Device: ${deviceName} | Platform: ${platform} | Touch: ${touchPoints}
    
    // ── Core navigator overrides ──
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    try { delete navigator.__webdriver_script_fn; } catch(e) {}
    try { delete navigator.__proto__.webdriver; } catch(e) {}
    
    // Platform
    Object.defineProperty(navigator, 'platform', { get: () => '${platform}' });
    
    // User Agent
    ${mobileUA ? `Object.defineProperty(navigator, 'userAgent', { get: () => '${mobileUA.replace(/'/g, "\\'")}' });` : ''}
    
    // Touch points (CRITICAL for mobile detection)
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => ${touchPoints} });
    
    // Hardware
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${hwConcurrency} });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => ${devMemory} });
    
    // ── Touch events support ──
    if (!('ontouchstart' in window)) {
      window.ontouchstart = null;
      window.ontouchmove = null;
      window.ontouchend = null;
      window.ontouchcancel = null;
    }
    
    // Ensure TouchEvent constructor exists
    if (typeof TouchEvent === 'undefined') {
      window.TouchEvent = class TouchEvent extends UIEvent {
        constructor(type, init) {
          super(type, init);
          this.touches = init?.touches || [];
          this.targetTouches = init?.targetTouches || [];
          this.changedTouches = init?.changedTouches || [];
        }
      };
    }
    
    // Ensure Touch constructor exists
    if (typeof Touch === 'undefined') {
      window.Touch = class Touch {
        constructor(init) {
          this.identifier = init?.identifier || 0;
          this.target = init?.target || null;
          this.clientX = init?.clientX || 0;
          this.clientY = init?.clientY || 0;
          this.pageX = init?.pageX || 0;
          this.pageY = init?.pageY || 0;
          this.screenX = init?.screenX || 0;
          this.screenY = init?.screenY || 0;
          this.radiusX = init?.radiusX || 0;
          this.radiusY = init?.radiusY || 0;
          this.rotationAngle = init?.rotationAngle || 0;
          this.force = init?.force || 0;
        }
      };
    }
    
    // ── Screen dimensions ──
    Object.defineProperty(screen, 'width', { get: () => ${screenW} });
    Object.defineProperty(screen, 'height', { get: () => ${screenH} });
    Object.defineProperty(screen, 'availWidth', { get: () => ${screenW} });
    Object.defineProperty(screen, 'availHeight', { get: () => ${screenH} });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => ${dpr} });
    
    // ── Screen Orientation API ──
    if (!screen.orientation || screen.orientation.type !== 'portrait-primary') {
      Object.defineProperty(screen, 'orientation', {
        get: () => ({
          type: 'portrait-primary',
          angle: 0,
          lock: () => Promise.resolve(),
          unlock: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
          onchange: null,
        })
      });
    }
    
    // Legacy window.orientation
    Object.defineProperty(window, 'orientation', { get: () => 0 });
    window.onorientationchange = null;
    
    // ── UserAgentData (mobile: true) ──
    ${isChromium ? `
    if (navigator.userAgentData) {
      const _uaData = navigator.userAgentData;
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => ({
          brands: _uaData.brands || [{brand:'Chromium',version:'120'},{brand:'Google Chrome',version:'120'}],
          mobile: true,
          platform: '${isIOS ? 'iOS' : 'Android'}',
          getHighEntropyValues: (hints) => Promise.resolve({
            brands: _uaData.brands || [{brand:'Chromium',version:'120'}],
            mobile: true,
            platform: '${isIOS ? 'iOS' : 'Android'}',
            platformVersion: '${isIOS ? '17.0' : '13.0'}',
            architecture: '${isIOS ? '' : 'arm'}',
            bitness: '${isIOS ? '' : '64'}',
            model: '${deviceName.replace(/'/g, "\\'")}',
            uaFullVersion: '120.0.0.0',
            fullVersionList: [{brand:'Chromium',version:'120.0.0.0'},{brand:'Google Chrome',version:'120.0.0.0'}],
          }),
          toJSON: () => ({ brands: [{brand:'Chromium',version:'120'}], mobile: true, platform: '${isIOS ? 'iOS' : 'Android'}' }),
        })
      });
    }
    ` : ''}
    
    // ── Network Information API (mobile) ──
    if (!navigator.connection) {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          type: 'cellular',
          downlink: ${(8 + Math.random() * 12).toFixed(1)},
          downlinkMax: Infinity,
          rtt: ${Math.floor(50 + Math.random() * 100)},
          saveData: false,
          onchange: null,
          ontypechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        })
      });
    } else {
      try {
        Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
        Object.defineProperty(navigator.connection, 'type', { get: () => 'cellular' });
      } catch(e) {}
    }
    
    // ── Battery API (realistic mobile) ──
    const batteryLevel = ${(0.3 + Math.random() * 0.6).toFixed(2)};
    const batteryCharging = ${Math.random() > 0.5};
    if (navigator.getBattery) {
      navigator.getBattery = () => Promise.resolve({
        charging: batteryCharging,
        chargingTime: batteryCharging ? ${Math.floor(300 + Math.random() * 3600)} : Infinity,
        dischargingTime: batteryCharging ? Infinity : ${Math.floor(3600 + Math.random() * 14400)},
        level: batteryLevel,
        addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true,
        onchargingchange: null, onchargingtimechange: null, ondischargingtimechange: null, onlevelchange: null,
      });
    }
    
    // ── DeviceOrientation & DeviceMotion events ──
    if (typeof DeviceOrientationEvent === 'undefined') {
      window.DeviceOrientationEvent = class DeviceOrientationEvent extends Event {
        constructor(type, init) {
          super(type, init);
          this.alpha = init?.alpha || null;
          this.beta = init?.beta || null;
          this.gamma = init?.gamma || null;
          this.absolute = init?.absolute || false;
        }
      };
    }
    if (typeof DeviceMotionEvent === 'undefined') {
      window.DeviceMotionEvent = class DeviceMotionEvent extends Event {
        constructor(type, init) {
          super(type, init);
          this.acceleration = init?.acceleration || null;
          this.accelerationIncludingGravity = init?.accelerationIncludingGravity || null;
          this.rotationRate = init?.rotationRate || null;
          this.interval = init?.interval || 16;
        }
      };
    }
    
    // ── CSS Media Query overrides ──
    const _matchMedia = window.matchMedia;
    window.matchMedia = function(query) {
      // Mobile: pointer is coarse (finger), hover is none
      if (query === '(hover: none)' || query === '(hover:none)') return { matches: true, media: query, onchange: null, addListener: ()=>{}, removeListener: ()=>{}, addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true };
      if (query === '(hover: hover)' || query === '(hover:hover)') return { matches: false, media: query, onchange: null, addListener: ()=>{}, removeListener: ()=>{}, addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true };
      if (query === '(pointer: coarse)' || query === '(pointer:coarse)') return { matches: true, media: query, onchange: null, addListener: ()=>{}, removeListener: ()=>{}, addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true };
      if (query === '(pointer: fine)' || query === '(pointer:fine)') return { matches: false, media: query, onchange: null, addListener: ()=>{}, removeListener: ()=>{}, addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true };
      if (query === '(any-pointer: coarse)' || query === '(any-pointer:coarse)') return { matches: true, media: query, onchange: null, addListener: ()=>{}, removeListener: ()=>{}, addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true };
      if (query === '(any-hover: none)' || query === '(any-hover:none)') return { matches: true, media: query, onchange: null, addListener: ()=>{}, removeListener: ()=>{}, addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true };
      return _matchMedia.call(window, query);
    };
    
    // ── Visual Viewport API ──
    if (!window.visualViewport) {
      window.visualViewport = {
        width: ${screenW}, height: ${screenH}, offsetLeft: 0, offsetTop: 0,
        pageLeft: 0, pageTop: 0, scale: 1.0,
        onresize: null, onscroll: null,
        addEventListener: ()=>{}, removeEventListener: ()=>{}, dispatchEvent: ()=>true,
      };
    }
    
    ${isIOS ? `
    // ── iOS-specific: standalone mode indicator ──
    Object.defineProperty(navigator, 'standalone', { get: () => false });
    ` : ''}
    
    // ── Permissions API ──
    const _origPQ = window.navigator.permissions.query;
    window.navigator.permissions.query = (p) => (
      p.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : _origPQ(p)
    );
    
    // Languages
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU','ru','en-US','en'] });
    
    ${isChromium ? `
    // Chrome plugins (mobile = empty)
    Object.defineProperty(navigator, 'plugins', { get: () => { const p = []; p.length = 0; p.item = () => null; p.namedItem = () => null; p.refresh = () => {}; return p; } });
    window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
    ` : ''}
    
    // Hide toString
    const _ts = Function.prototype.toString;
    Function.prototype.toString = function() {
      if (this === window.navigator.permissions.query) return 'function query() { [native code] }';
      if (this === window.matchMedia) return 'function matchMedia() { [native code] }';
      if (this === navigator.getBattery) return 'function getBattery() { [native code] }';
      return _ts.apply(this, arguments);
    };
    
    // WebRTC protection
    ${ad.webrtc?.block !== false ? `
    if (window.RTCPeerConnection) {
      const _RTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function(...args) {
        const pc = new _RTC(...args);
        const _ai = pc.addIceCandidate;
        pc.addIceCandidate = function(c) { if(c&&c.candidate&&c.candidate.includes('.local')) return Promise.resolve(); return _ai.apply(this,arguments); };
        return pc;
      };
      window.RTCPeerConnection.prototype = _RTC.prototype;
    }
    ` : ''}
    
    // Canvas noise
    ${ad.canvas?.noise !== false ? `
    (function() {
      const _td = HTMLCanvasElement.prototype.toDataURL;
      const _tb = HTMLCanvasElement.prototype.toBlob;
      const _gid = CanvasRenderingContext2D.prototype.getImageData;
      const s = { r:Math.floor(Math.random()*10)-5, g:Math.floor(Math.random()*10)-5, b:Math.floor(Math.random()*10)-5, a:Math.floor(Math.random()*10)-5 };
      function n(c,x) { if(!c.width||!c.height)return; try { const d=_gid.call(x,0,0,c.width,c.height); for(let i=0;i<d.data.length;i+=4){d.data[i]+=s.r;d.data[i+1]+=s.g;d.data[i+2]+=s.b;d.data[i+3]+=s.a;} x.putImageData(d,0,0); } catch(e){} }
      HTMLCanvasElement.prototype.toDataURL = function() { try{n(this,this.getContext('2d'));}catch(e){} return _td.apply(this,arguments); };
      HTMLCanvasElement.prototype.toBlob = function() { try{n(this,this.getContext('2d'));}catch(e){} return _tb.apply(this,arguments); };
    })();
    ` : ''}
    
    // Audio noise
    ${ad.audio?.noise !== false ? `
    (function() { const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return; const _ca=AC.prototype.createAnalyser; AC.prototype.createAnalyser=function(){const a=_ca.apply(this,arguments);const _g=a.getFloatFrequencyData;a.getFloatFrequencyData=function(r){_g.apply(this,arguments);for(let i=0;i<r.length;i++)r[i]+=Math.random()*0.0001;};return a;}; })();
    ` : ''}
  `;
}

// ─── MAIN LAUNCH FUNCTION ─────────────────────────────────────────────
async function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h')) {
      log('AEZAKMI Launcher v2.1.0');
      log('Usage: node launch_playwright.cjs <base64-payload>');
      log('       node launch_playwright.cjs --dry-run');
      process.exit(0);
    }
    if (argv.includes('--dry-run')) {
      log('Dry-run OK');
      process.exit(0);
    }

    // Parse payload
    const payloadArg = argv.find(a => a.startsWith('--payload='));
    const payloadB64 = payloadArg ? payloadArg.replace('--payload=', '') : argv[0];
    if (!payloadB64) throw new Error('Missing payload argument');

    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const payload = JSON.parse(json);

    log('[LAUNCHER] ═══════════════════════════════════════');
    log('[LAUNCHER] 🔍 PAYLOAD DUMP:', JSON.stringify({
      profileDir: payload.profileDir,
      browserType: payload.browserType,
      hasProxy: !!payload.proxy,
      proxyServer: payload.proxy?.server,
      proxyUsername: payload.proxy?.username ? '***' : 'нет',
      proxyPassword: payload.proxy?.password ? '***' : 'нет',
      proxyFULL: payload.proxy, // ПОЛНЫЙ объект прокси
      autoDetectLocale: payload.autoDetectLocale,
      locale: payload.locale,
      timezoneId: payload.timezoneId
    }, null, 2));
    log('[LAUNCHER] ═══════════════════════════════════════');
    log('[LAUNCHER] Профиль:', payload.profileDir);
    log('[LAUNCHER] Движок:', payload.browserType || 'chromium');
    log('[LAUNCHER] Язык:', payload.locale || 'не указан');
    log('[LAUNCHER] Часовой пояс:', payload.timezoneId || 'не указан');
    log('[LAUNCHER] Мобильная эмуляция:', payload.mobileEmulation?.enabled ? `✅ ${payload.mobileEmulation.deviceName}` : '❌');
    log('[LAUNCHER] ═══════════════════════════════════════');

    // Resolve browser engine
    const browserInfo = getBrowserEngine(payload.browserType);
    log(`[LAUNCHER] Браузер: ${browserInfo.name}`);

    // Ensure browser is installed
    await ensureBrowserInstalled(browserInfo);

    const profileDir = payload.profileDir || `./aezakmi-profile-${Date.now()}`;

    // Домашняя страница: Google по умолчанию (максимальная стабильность через прокси)
    let url = payload.url || 'https://www.google.com';

    // ─── Proxy setup ───
    let proxyConfig = undefined;
    let anonymizedProxy = null;
    let socksProxyServer = null;

    if (payload.proxy && payload.proxy.server) {
      const { server, username, password } = payload.proxy;
      const hasAuth = !!(username && password);
      const isSocks = server.toLowerCase().includes('socks');

      log('[LAUNCHER] ═══ ПРОКСИ КОНФИГУРАЦИЯ ═══');
      log('[LAUNCHER] Движок:', browserInfo.name);
      log('[LAUNCHER] Сервер:', server);
      log('[LAUNCHER] Авторизация:', hasAuth ? 'ДА' : 'НЕТ');
      log('[LAUNCHER] Тип:', isSocks ? 'SOCKS' : 'HTTP/HTTPS');

      // WebKit НЕ ПОДДЕРЖИВАЕТ авторизацию прокси напрямую
      // Нужно ВСЕГДА создавать локальный туннель без авторизации
      if (browserInfo.isWebKit && hasAuth) {
        log('[LAUNCHER] 🔧 WebKit + auth: создаём локальный туннель БЕЗ авторизации');

        if (isSocks) {
          // SOCKS прокси -> HTTP туннель
          let socksHost, socksPort;
          if (server.includes('://')) {
            const u = new URL(server);
            socksHost = u.hostname;
            socksPort = u.port || '1080';
          } else {
            const parts = server.replace(/^socks5?:\/\//, '').split(':');
            socksHost = parts[0];
            socksPort = parts[1] || '1080';
          }

          log('[LAUNCHER] SOCKS туннель:', `${socksHost}:${socksPort}`);
          const proxyInfo = await createSocksToHttpProxy(socksHost, socksPort, username, password);
          socksProxyServer = proxyInfo.server;
          proxyConfig = { server: `http://127.0.0.1:${proxyInfo.port}` };
          log('[LAUNCHER] ✅ Локальный HTTP туннель для WebKit:', proxyConfig.server);

        } else {
          // HTTP/HTTPS прокси -> анонимизированный туннель через proxy-chain
          try { ProxyChain = require('proxy-chain'); } catch (e) {
            error('[LAUNCHER] ⚠️ proxy-chain не найден, пытаемся установить...');
          }

          if (!ProxyChain) {
            error('[LAUNCHER] ❌ КРИТИЧЕСКАЯ ОШИБКА: proxy-chain не установлен!');
            error('[LAUNCHER] WebKit требует proxy-chain для HTTP прокси с авторизацией');
            throw new Error('Установите proxy-chain: npm install proxy-chain');
          }

          // Формируем URL с авторизацией
          let proxyUrl = server;
          if (!proxyUrl.includes('@')) {
            if (!proxyUrl.startsWith('http')) {
              proxyUrl = 'http://' + proxyUrl;
            }
            try {
              const u = new URL(proxyUrl);
              u.username = encodeURIComponent(username);
              u.password = encodeURIComponent(password);
              proxyUrl = u.toString();
            } catch (urlErr) {
              error('[LAUNCHER] ❌ Не удалось создать URL прокси:', urlErr.message);
              throw urlErr;
            }
          }

          log('[LAUNCHER] Анонимизируем прокси через proxy-chain');
          try {
            anonymizedProxy = await ProxyChain.anonymizeProxy(proxyUrl);
            proxyConfig = { server: anonymizedProxy };
            log('[LAUNCHER] ✅ Локальный туннель для WebKit:', proxyConfig.server);
          } catch (chainErr) {
            error('[LAUNCHER] ❌ Ошибка proxy-chain:', chainErr.message);
            throw new Error(`proxy-chain ошибка: ${chainErr.message}`);
          }
        }

      } else if (isSocks) {
        // SOCKS для других движков (Chromium/Firefox)
        log('[LAUNCHER] 🔧 SOCKS туннель для', browserInfo.name);

        let socksHost, socksPort;
        if (server.includes('://')) {
          const u = new URL(server);
          socksHost = u.hostname;
          socksPort = u.port || '1080';
        } else {
          const parts = server.replace(/^socks5?:\/\//, '').split(':');
          socksHost = parts[0];
          socksPort = parts[1] || '1080';
        }

        const proxyInfo = await createSocksToHttpProxy(socksHost, socksPort, username, password);
        socksProxyServer = proxyInfo.server;
        proxyConfig = { server: `http://127.0.0.1:${proxyInfo.port}` };
        log('[LAUNCHER] ✅ SOCKS туннель:', proxyConfig.server);

      } else if (hasAuth && (browserInfo.isFirefox || browserInfo.isChromium)) {
        // HTTP/HTTPS с авторизацией для Chromium/Firefox
        log('[LAUNCHER] 🔧 HTTP прокси с авторизацией для', browserInfo.name);

        try { ProxyChain = require('proxy-chain'); } catch (e) { }

        if (ProxyChain) {
          let proxyUrl = server;
          if (!proxyUrl.includes('@')) {
            if (!proxyUrl.startsWith('http')) proxyUrl = 'http://' + proxyUrl;
            const u = new URL(proxyUrl);
            u.username = encodeURIComponent(username);
            u.password = encodeURIComponent(password);
            proxyUrl = u.toString();
          }

          anonymizedProxy = await ProxyChain.anonymizeProxy(proxyUrl);
          proxyConfig = { server: anonymizedProxy };
          log('[LAUNCHER] ✅ proxy-chain туннель:', proxyConfig.server);
        } else {
          // Fallback: передаём напрямую (Chromium поддерживает)
          log('[LAUNCHER] ⚠️ proxy-chain не найден, используем прямую авторизацию');
          proxyConfig = { server, username, password };
        }

      } else {
        // Прокси без авторизации - просто передаём
        log('[LAUNCHER] 🔧 Прокси без авторизации');
        proxyConfig = { server };
      }

      log('[LAUNCHER] ═══ ФИНАЛЬНАЯ КОНФИГУРАЦИЯ ═══');
      log('[LAUNCHER] Сервер:', proxyConfig?.server);
      log('[LAUNCHER] Туннель:', !!(socksProxyServer || anonymizedProxy) ? 'АКТИВЕН' : 'НЕТ');
      log('[LAUNCHER] ═══════════════════════════════');
    } else {
      log('[LAUNCHER] 🌐 Прокси не используется');
    }

    // ─── Автоопределение локализации по РЕАЛЬНОМУ исходящему IP ───
    log('[LAUNCHER] ═══ ДИАГНОСТИКА АВТООПРЕДЕЛЕНИЯ ═══');
    log('[LAUNCHER] payload.autoDetectLocale:', payload.autoDetectLocale);
    log('[LAUNCHER] proxyConfig:', !!proxyConfig);
    log('[LAUNCHER] Условие сработает?', !!(payload.autoDetectLocale && proxyConfig));

    let detectedLocale = payload.locale || 'ru-RU';
    let detectedTimezone = payload.timezoneId || 'Europe/Moscow';

    if (payload.autoDetectLocale && proxyConfig) {
      log('[LAUNCHER] ═══ АВТООПРЕДЕЛЕНИЕ ЛОКАЛИЗАЦИИ ПО РЕАЛЬНОМУ IP ═══');
      try {
        // Получаем реальный исходящий IP через ОРИГИНАЛЬНЫЙ SOCKS прокси
        // НЕ через локальный туннель!
        const originalProxy = payload.proxy; // ОРИГИНАЛЬНЫЕ данные из payload
        log('[LAUNCHER] 📍 Оригинальный прокси:', originalProxy.server);
        log('[LAUNCHER] 🔐 Авторизация:', !!(originalProxy.username && originalProxy.password));

        const realIP = await getRealIPThroughProxy(originalProxy);
        log('[LAUNCHER] 🌐 Реальный исходящий IP:', realIP);

        if (realIP) {
          // Определяем timezone и язык по реальному IP
          const geoInfo = await getGeoIPInfoFromIP(realIP);
          log('[LAUNCHER] GeoInfo результат:', geoInfo);
          if (geoInfo) {
            detectedLocale = geoInfo.language;
            detectedTimezone = geoInfo.timezone;
            log('[LAUNCHER] ✅ Автоопределено по исходящему IP:');
            log('[LAUNCHER]    Страна:', geoInfo.country);
            log('[LAUNCHER]    Язык:', detectedLocale);
            log('[LAUNCHER]    Timezone:', detectedTimezone);
          } else {
            warn('[LAUNCHER] ⚠️ Не удалось определить GeoIP, используем значения по умолчанию');
          }
        } else {
          warn('[LAUNCHER] ⚠️ Не удалось получить реальный IP, используем значения по умолчанию');
        }
      } catch (err) {
        error('[LAUNCHER] ❌ Ошибка автоопределения локализации:', err.message);
        error('[LAUNCHER] Stack:', err.stack);
        log('[LAUNCHER] Используем значения по умолчанию');
      }
      log('[LAUNCHER] ═══════════════════════════════════════════════════');
    } else {
      log('[LAUNCHER] ⏭️ Автоопределение пропущено, используем значения из профиля');
    }

    // ─── Build launch options ───
    const isMobile = payload.mobileEmulation?.enabled || false;

    log('[LAUNCHER] ═══ ЛОКАЛИЗАЦИЯ (ДЛЯ ВСЕХ ДВИЖКОВ) ═══');
    log('[LAUNCHER] Движок:', browserInfo.name);
    log('[LAUNCHER] Язык (locale):', detectedLocale);
    log('[LAUNCHER] Часовой пояс (timezone):', detectedTimezone);
    log('[LAUNCHER] ═════════════════════════════════════');

    const contextOptions = {
      headless: false,
      locale: detectedLocale, // Определен по реальному исходящему IP
      timezoneId: detectedTimezone, // Определен по реальному исходящему IP
    };

    // Chromium-specific args
    if (browserInfo.isChromium) {
      contextOptions.args = getChromiumStealthArgs();
      contextOptions.ignoreDefaultArgs = ['--enable-automation'];
      
      // Передаём прокси через args (вместо contextOptions.proxy)
      // Это заставляет Chromium маршрутизировать DNS через прокси
      if (proxyConfig && proxyConfig.server) {
        log('[LAUNCHER] 🌐 DNS будет резолвиться через прокси туннель');
        contextOptions.args.push(`--proxy-server=${proxyConfig.server}`);
      }
    } else {
      // Прокси для других движков (запасной вариант)
      if (proxyConfig) {
        contextOptions.proxy = proxyConfig;
      }
    }

    // Mobile emulation via Playwright context
    if (isMobile && payload.mobileEmulation) {
      const m = payload.mobileEmulation;
      contextOptions.viewport = { width: m.width || 390, height: m.height || 844 };
      contextOptions.deviceScaleFactor = m.deviceScaleFactor || 3;
      contextOptions.isMobile = true;
      contextOptions.hasTouch = true;
      if (m.userAgent) contextOptions.userAgent = m.userAgent;
      log('[LAUNCHER] 📱 Мобильный режим:', m.deviceName, `${m.width}x${m.height} @${m.deviceScaleFactor}x`);
    } else {
      contextOptions.viewport = null; // Use browser window size
    }

    // ─── Launch browser ───
    log(`[LAUNCHER] 🚀 Запуск ${browserInfo.name}...`);
    const context = await browserInfo.engine.launchPersistentContext(profileDir, contextOptions);
    log(`[LAUNCHER] ✅ ${browserInfo.name} запущен`);

    // ─── Inject antidetect scripts ───
    const antidetectScript = isMobile
      ? buildMobileAntidetectScript(payload)
      : buildDesktopAntidetectScript(payload);

    await context.addInitScript({ content: antidetectScript });

    // Also inject into existing pages
    const page = context.pages().length ? context.pages()[0] : await context.newPage();
    await page.addInitScript({ content: antidetectScript });

    // ─── Inject cookies (if provided) ───
    if (payload.cookies && Array.isArray(payload.cookies) && payload.cookies.length > 0) {
      log(`[LAUNCHER] 🍪 Загрузка ${payload.cookies.length} cookies...`);
      try {
        const formattedCookies = payload.cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          expires: c.expires || (Date.now() / 1000 + 86400 * 365),
          httpOnly: c.httpOnly || false,
          secure: c.secure || false,
          sameSite: c.sameSite || 'Lax',
        }));
        await context.addCookies(formattedCookies);
        log(`[LAUNCHER] ✅ ${formattedCookies.length} cookies загружены`);
      } catch (cookieErr) {
        warn('[LAUNCHER] ⚠️ Ошибка загрузки cookies:', cookieErr.message);
      }
    }

    // Navigate
    page.on('requestfailed', (req) => {
      try { warn('[requestfailed]', req.url(), req.failure()?.errorText); } catch (e) { }
    });

    log('[LAUNCHER] 🌐 Переход на:', url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      log('[LAUNCHER] ✅ Страница загружена:', url);
    } catch (err) {
      warn('[LAUNCHER] ⚠️ page.goto error:', err?.message || err);

      // Fallback: пробуем Google если исходная страница не загрузилась
      if (url !== 'https://www.google.com') {
        try {
          log('[LAUNCHER] Fallback: переход на Google');
          await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
          log('[LAUNCHER] ✅ Fallback загружен');
        } catch (fallbackErr) {
          warn('[LAUNCHER] ⚠️ Fallback тоже не загрузился, браузер готов к ручной навигации');
        }
      }
    }

    try {
      const ip = await page.evaluate(() => fetch('https://api.ipify.org').then(r => r.text()).catch(() => null));
      if (ip) log('[LAUNCHER] IP:', ip);
    } catch (e) { }

    // Wait for browser close
    log('[LAUNCHER] Ожидание закрытия браузера...');
    try { await context.waitForEvent('close', { timeout: 0 }); } catch (err) { }
    try { await context.close(); } catch (err) { }

    // Cleanup proxy
    if (anonymizedProxy && ProxyChain?.closeAnonymizedProxy) {
      try { await ProxyChain.closeAnonymizedProxy(anonymizedProxy); } catch (e) { }
    }
    if (socksProxyServer) {
      try { socksProxyServer.close(); } catch (e) { }
    }

  } catch (err) {
    error('[LAUNCHER] ❌ Ошибка:', err.message);
    process.exit(1);
  }
}

main();
