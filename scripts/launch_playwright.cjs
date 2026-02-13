#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// AEZAKMI Antidetect Browser Launcher v2.1.0
// Unified launcher: multi-engine (Chromium/Firefox/WebKit) + mobile fingerprints
// Usage: node scripts/launch_playwright.cjs '<base64-encoded-json>'
// ═══════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');

// ─── PRODUCTION MODE ──────────────────────────────────────────────────
// Проверяем production режим (если нет node_modules рядом = production)
const isDev = fs.existsSync(path.join(__dirname, '..', 'node_modules'));
const log = isDev ? console.log.bind(console) : () => {};
const warn = isDev ? console.warn.bind(console) : () => {};
const error = console.error.bind(console); // Errors всегда показываем

// ─── PRODUCTION ERROR LOG ─────────────────────────────────────────────
// В production пишем ошибки в файл (stderr может быть потерян)
const logFilePath = (() => {
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const logDir = path.join(localAppData, 'AEZAKMI Pro', 'logs');
    try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
    return path.join(logDir, 'launcher.log');
  }
  return null;
})();

function logToFile(msg) {
  if (!logFilePath) return;
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${ts}] ${msg}\n`);
  } catch (e) {}
}

// Перехватываем все необработанные ошибки
process.on('uncaughtException', (err) => {
  const msg = `UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`;
  error(msg);
  logToFile(msg);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = `UNHANDLED REJECTION: ${reason}`;
  error(msg);
  logToFile(msg);
  process.exit(1);
});

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
// ВАЖНО: загружаем playwright-core НАПРЯМУЮ по абсолютному пути!
// v3.0.1: playwright-core теперь в %LOCALAPPDATA%/AEZAKMI Pro/playwright/modules/
// (распаковывается из ZIP при первом запуске Rust-кодом)
const localAppData = process.env.LOCALAPPDATA || '';
const appDataModules = localAppData ? path.join(localAppData, 'AEZAKMI Pro', 'playwright', 'modules') : '';

const playwrightCorePaths = [
  // v3.0.1: AppData (основной путь в production!)
  appDataModules ? path.join(appDataModules, 'playwright-core') : '',
  path.join(appDir, 'playwright', 'modules', 'playwright-core'),       // Bundled fallback
  path.join(appDir, 'playwright', 'node_modules', 'playwright-core'),  // Dev/fallback
  path.join(appDir, 'node_modules', 'playwright-core'),                // Alt fallback
].filter(Boolean);

// Также пробуем playwright (wrapper), но только если прямой путь к core не сработал
const playwrightWrapperPaths = [
  appDataModules ? path.join(appDataModules, 'playwright') : '',
  path.join(appDir, 'playwright', 'modules', 'playwright'),
  path.join(appDir, 'playwright', 'node_modules', 'playwright'),
  path.join(appDir, 'node_modules', 'playwright'),
  'playwright'
].filter(Boolean);

let playwright = null;

// Метод 1: playwright-core напрямую (надёжный — без промежуточного require)
for (const tryPath of playwrightCorePaths) {
  if (fs.existsSync(tryPath)) {
    try {
      playwright = require(tryPath);
      log('[LAUNCHER] ✅ playwright-core загружен из:', tryPath);
      break;
    } catch (err) {
      log('[LAUNCHER] ❌ playwright-core не удалось:', tryPath, err.message);
    }
  }
}

// Метод 2: playwright wrapper (fallback)
if (!playwright) {
  for (const tryPath of playwrightWrapperPaths) {
    if (fs.existsSync(tryPath) || tryPath === 'playwright') {
      try {
        playwright = require(tryPath);
        log('[LAUNCHER] ✅ Playwright (wrapper) загружен из:', tryPath);
        break;
      } catch (err) {
        log('[LAUNCHER] ❌ Не удалось загрузить из:', tryPath, err.message);
      }
    }
  }
}

if (!playwright) {
  error('[LAUNCHER] КРИТИЧЕСКАЯ ОШИБКА: Playwright не найден!');
  process.exit(1);
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
    
    // ── WebGL vendor/renderer spoofing ──
    ${ad.webgl?.noise !== false ? `
    (function() {
      const vendor = '${(ad.webgl?.vendor || 'Intel Inc.').replace(/'/g, "\\'")}';
      const renderer = '${(ad.webgl?.renderer || 'Intel Iris OpenGL Engine').replace(/'/g, "\\'")}';
      
      const _getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 0x9245 || param === 37445) return vendor;
        if (param === 0x9246 || param === 37446) return renderer;
        return _getParameter.call(this, param);
      };
      
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const _getParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(param) {
          if (param === 0x9245 || param === 37445) return vendor;
          if (param === 0x9246 || param === 37446) return renderer;
          return _getParameter2.call(this, param);
        };
      }
    })();
    ` : ''}
    
    // ── Screen dimensions spoofing (desktop) ──
    ${payload.screen ? `
    (function() {
      const sw = ${payload.screen.width || 1920};
      const sh = ${payload.screen.height || 1080};
      Object.defineProperty(screen, 'width', { get: () => sw });
      Object.defineProperty(screen, 'height', { get: () => sh });
      Object.defineProperty(screen, 'availWidth', { get: () => sw });
      Object.defineProperty(screen, 'availHeight', { get: () => sh });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
    })();
    ` : ''}
    
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

    // ─── RESOLVE PROFILE DIRECTORY ───
    // КРИТИЧЕСКИ ВАЖНО: profileDir ДОЛЖЕН быть абсолютным путём в ЗАПИСЫВАЕМОЙ папке!
    // C:\Program Files\ — НЕ записываема без админ прав!
    // Поэтому всегда резолвим в %LOCALAPPDATA%\AEZAKMI Pro\profiles\<name>
    let profileDir = payload.profileDir || `aezakmi-profile-${Date.now()}`;
    
    if (!path.isAbsolute(profileDir)) {
      // Резолвим в AppData (записываемая директория)
      const profilesBase = process.env.AEZAKMI_PROFILES_DIR 
        || (process.env.LOCALAPPDATA 
          ? path.join(process.env.LOCALAPPDATA, 'AEZAKMI Pro', 'profiles')
          : path.join(appDir, 'profiles'));
      
      profileDir = path.join(profilesBase, profileDir);
    }
    
    // Создаём директорию если не существует
    try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
    
    log('[LAUNCHER] 📁 Профиль:', profileDir);
    logToFile(`Profile dir: ${profileDir}`);

    // Домашняя страница: Google по умолчанию (максимальная стабильность через прокси)
    let url = payload.url || 'https://www.google.com';

    // ─── Proxy setup ───
    // УПРОЩЁННЫЙ подход: для Chromium передаём прокси НАПРЯМУЮ через --proxy-server
    // Авторизация через page-level CDP: context.setHTTPCredentials / page.authenticate
    // НЕ используем socks, proxy-chain — их нет в bundled modules!
    let proxyConfig = undefined;
    let proxyCredentials = null; // { username, password } для page.authenticate

    if (payload.proxy && payload.proxy.server) {
      const { server, username, password } = payload.proxy;
      const hasAuth = !!(username && password);
      const isSocks = server.toLowerCase().includes('socks');

      log('[LAUNCHER] ═══ ПРОКСИ КОНФИГУРАЦИЯ ═══');
      log('[LAUNCHER] Сервер:', server);
      log('[LAUNCHER] Авторизация:', hasAuth ? 'ДА' : 'НЕТ');
      log('[LAUNCHER] Тип:', isSocks ? 'SOCKS' : 'HTTP/HTTPS');
      logToFile(`Proxy: ${server}, auth: ${hasAuth}, socks: ${isSocks}`);

      // Для Chromium: прокси передаём через --proxy-server (поддерживает socks5 и http)
      // Авторизацию — через CDP (page.authenticate)
      let proxyServer = server;
      
      // Нормализуем URL прокси
      if (!proxyServer.includes('://')) {
        proxyServer = (isSocks ? 'socks5' : 'http') + '://' + proxyServer;
      }
      
      proxyConfig = { server: proxyServer };
      
      if (hasAuth) {
        proxyCredentials = { username, password };
        log('[LAUNCHER] 🔑 Авторизация будет через CDP (page-level)');
      }

      log('[LAUNCHER] ═══ ФИНАЛЬНАЯ КОНФИГУРАЦИЯ ═══');
      log('[LAUNCHER] Сервер:', proxyConfig.server);
      log('[LAUNCHER] ═══════════════════════════════');
    } else {
      log('[LAUNCHER] 🌐 Прокси не используется');
    }

    // ─── Locale / timezone из профиля ───
    let detectedLocale = payload.locale || 'ru-RU';
    let detectedTimezone = payload.timezoneId || 'Europe/Moscow';

    // ─── Build launch options ───
    const isMobile = payload.mobileEmulation?.enabled || false;

    log('[LAUNCHER] Язык:', detectedLocale);
    log('[LAUNCHER] Часовой пояс:', detectedTimezone);

    const contextOptions = {
      headless: false,
      locale: detectedLocale,
      timezoneId: detectedTimezone,
    };

    // Chromium-specific args
    if (browserInfo.isChromium) {
      contextOptions.args = getChromiumStealthArgs();
      contextOptions.ignoreDefaultArgs = ['--enable-automation'];
      
      // Передаём прокси через --proxy-server (поддерживает http, https, socks5)
      // DNS будет резолвиться через прокси автоматически
      if (proxyConfig && proxyConfig.server) {
        log('[LAUNCHER] 🌐 Прокси через --proxy-server:', proxyConfig.server);
        logToFile(`Proxy arg: --proxy-server=${proxyConfig.server}`);
        contextOptions.args.push(`--proxy-server=${proxyConfig.server}`);
      }
    } else {
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
    logToFile(`Launching browser with options: ${JSON.stringify({proxy: proxyConfig?.server, locale: detectedLocale, timezone: detectedTimezone})}`);
    const context = await browserInfo.engine.launchPersistentContext(profileDir, contextOptions);
    log(`[LAUNCHER] ✅ ${browserInfo.name} запущен`);
    logToFile('Browser launched OK');

    // ─── Proxy авторизация через CDP ───
    // Если прокси требует логин/пароль — устанавливаем через page-level HTTP credentials
    // Это работает для HTTP/HTTPS прокси. SOCKS5 с auth передаётся напрямую через URL.
    if (proxyCredentials) {
      log('[LAUNCHER] 🔑 Устанавливаем proxy auth credentials');
      logToFile(`Setting proxy auth for user: ${proxyCredentials.username}`);
      
      // Устанавливаем HTTP credentials для всех страниц контекста
      // Это перехватит 407 Proxy Authentication Required
      try {
        const cdpSession = await context.newCDPSession(context.pages()[0] || await context.newPage());
        await cdpSession.send('Fetch.enable', {
          handleAuthRequests: true
        });
        cdpSession.on('Fetch.authRequired', async (event) => {
          try {
            await cdpSession.send('Fetch.continueWithAuth', {
              requestId: event.requestId,
              authChallengeResponse: {
                response: 'ProvideCredentials',
                username: proxyCredentials.username,
                password: proxyCredentials.password
              }
            });
          } catch (e) {}
        });
        cdpSession.on('Fetch.requestPaused', async (event) => {
          try {
            await cdpSession.send('Fetch.continueRequest', { requestId: event.requestId });
          } catch (e) {}
        });
        log('[LAUNCHER] ✅ Proxy auth установлен через CDP');
      } catch (cdpErr) {
        warn('[LAUNCHER] ⚠️ CDP auth failed, trying page-level auth:', cdpErr.message);
        // Fallback: пробуем через route
        try {
          await context.route('**/*', async (route) => {
            await route.continue_();
          });
        } catch (e) {}
      }
    }

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

  } catch (err) {
    error('[LAUNCHER] ❌ Ошибка:', err.message);
    logToFile(`ERROR: ${err.message}\n${err.stack}`);
    process.exit(1);
  }
}

main();
