#!/usr/bin/env node
/**
 * AEZAKMI Pro - Advanced Antidetect Browser Launcher
 * Вдохновлено архитектурой donutbrowser с использованием Camoufox
 * Поддержка: Chromium, Firefox, Camoufox (anti-detect Firefox)
 */

import { chromium, firefox } from 'playwright';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Конфигурация антидетект-систем
const ANTIDETECT_CONFIG = {
  // Canvas fingerprinting protection
  canvas: {
    noise: true,
    toDataURL: true,
    toBlob: true,
  },
  // WebGL fingerprinting protection
  webgl: {
    noise: true,
    vendor: 'Intel Inc.',
    renderer: 'Intel Iris OpenGL Engine',
  },
  // Audio context fingerprinting
  audio: {
    noise: true,
    contextNoise: 0.001,
  },
  // WebRTC leak protection
  webrtc: {
    block: true,
    replacePublicIP: true,
    replaceLocalIP: true,
  },
  // Font fingerprinting
  fonts: {
    restrict: true,
    whitelist: [
      'Arial', 'Verdana', 'Times New Roman', 'Courier New',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Impact'
    ],
  },
  // Plugin enumeration
  plugins: {
    fake: true,
    mimeTypes: [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'PDF Document' },
    ],
  },
};

/**
 * Генератор реалистичных фингерпринтов на основе ОС и разрешения экрана
 */
class FingerprintGenerator {
  constructor() {
    this.fingerprints = {
      windows: {
        userAgents: [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        ],
        screens: [
          { width: 1920, height: 1080 },
          { width: 2560, height: 1440 },
          { width: 1366, height: 768 },
          { width: 1600, height: 900 },
        ],
        platforms: ['Win32', 'Win64'],
      },
      macos: {
        userAgents: [
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        ],
        screens: [
          { width: 1920, height: 1080 },
          { width: 2560, height: 1600 },
          { width: 1680, height: 1050 },
        ],
        platforms: ['MacIntel'],
      },
      linux: {
        userAgents: [
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
        ],
        screens: [
          { width: 1920, height: 1080 },
          { width: 2560, height: 1440 },
        ],
        platforms: ['Linux x86_64'],
      },
    };
  }

  generate(os = 'windows', options = {}) {
    const osData = this.fingerprints[os.toLowerCase()] || this.fingerprints.windows;
    
    const userAgent = options.userAgent || 
      osData.userAgents[Math.floor(Math.random() * osData.userAgents.length)];
    
    const screen = options.screen || 
      osData.screens[Math.floor(Math.random() * osData.screens.length)];
    
    const platform = options.platform || 
      osData.platforms[Math.floor(Math.random() * osData.platforms.length)];

    // Генерируем реалистичные параметры
    const hardwareConcurrency = options.cores || (Math.random() > 0.5 ? 8 : 4);
    const deviceMemory = options.memory || (Math.random() > 0.5 ? 8 : 16);
    
    // WebGL Vendor/Renderer на основе статистики
    const webglConfigs = [
      { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
      { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1650/PCIe/SSE2' },
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)' },
    ];
    const webgl = webglConfigs[Math.floor(Math.random() * webglConfigs.length)];

    return {
      userAgent,
      platform,
      screen,
      viewport: { width: screen.width, height: screen.height - 100 }, // Учитываем браузерный UI
      hardwareConcurrency,
      deviceMemory,
      webgl,
      languages: options.languages || ['ru-RU', 'ru', 'en-US', 'en'],
      timezone: options.timezone || 'Europe/Moscow',
      doNotTrack: null, // Современные браузеры не отправляют DNT
      colorDepth: 24,
      pixelRatio: options.pixelRatio || 1,
    };
  }
}

/**
 * Продвинутые скрипты антидетекта для инжекции в страницу
 */
const getAntidetectScripts = (fingerprint, config) => {
  return `
    // Canvas Fingerprinting Protection
    (function() {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

      // Добавляем шум к canvas
      const addCanvasNoise = (imageData) => {
        if (!${config.canvas.noise}) return imageData;
        
        const data = imageData.data;
        const noise = 0.1; // Минимальный шум, незаметный глазу
        for (let i = 0; i < data.length; i += 4) {
          data[i] += Math.random() * noise - noise / 2;     // R
          data[i + 1] += Math.random() * noise - noise / 2; // G
          data[i + 2] += Math.random() * noise - noise / 2; // B
        }
        return imageData;
      };

      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          addCanvasNoise(imageData);
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, args);
      };

      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const imageData = originalGetImageData.apply(this, args);
        return addCanvasNoise(imageData);
      };
    })();

    // WebGL Fingerprinting Protection
    (function() {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
          return '${fingerprint.webgl.vendor}';
        }
        if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
          return '${fingerprint.webgl.renderer}';
        }
        return getParameter.apply(this, arguments);
      };

      // WebGL2
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return '${fingerprint.webgl.vendor}';
          if (parameter === 37446) return '${fingerprint.webgl.renderer}';
          return getParameter2.apply(this, arguments);
        };
      }
    })();

    // Audio Context Fingerprinting Protection
    (function() {
      const audioContext = window.AudioContext || window.webkitAudioContext;
      if (audioContext) {
        const OriginalAnalyser = audioContext.prototype.constructor;
        audioContext.prototype.createAnalyser = function() {
          const analyser = OriginalAnalyser.prototype.createAnalyser.apply(this, arguments);
          const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
          analyser.getFloatFrequencyData = function(array) {
            originalGetFloatFrequencyData.apply(this, arguments);
            // Добавляем минимальный шум
            for (let i = 0; i < array.length; i++) {
              array[i] += (Math.random() - 0.5) * ${config.audio.contextNoise};
            }
          };
          return analyser;
        };
      }
    })();

    // Navigator Properties Override
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
      get: () => ${fingerprint.hardwareConcurrency}
    });

    Object.defineProperty(Navigator.prototype, 'deviceMemory', {
      get: () => ${fingerprint.deviceMemory}
    });

    Object.defineProperty(Navigator.prototype, 'platform', {
      get: () => '${fingerprint.platform}'
    });

    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => ${JSON.stringify(fingerprint.languages)}
    });

    // WebRTC Protection
    ${config.webrtc.block ? `
    if (window.RTCPeerConnection) {
      window.RTCPeerConnection = undefined;
    }
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = undefined;
    }
    if (window.mozRTCPeerConnection) {
      window.mozRTCPeerConnection = undefined;
    }
    ` : ''}

    // Remove automation indicators
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => undefined
    });

    // Chrome-specific
    if (window.chrome) {
      delete window.chrome.runtime;
      Object.defineProperty(window, 'chrome', {
        get: () => ({
          loadTimes: () => {},
          csi: () => {},
          app: {}
        })
      });
    }

    // Permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );

    console.log('[ANTIDETECT] Защита активирована');
  `;
};

/**
 * Создание локального прокси-туннеля для авторизации
 */
class ProxyTunnel {
  constructor() {
    this.tunnels = new Map();
  }

  async create(upstreamProxy) {
    try {
      console.log('[PROXY TUNNEL] Создание туннеля для:', upstreamProxy.server);
      
      // Используем proxy-chain для создания локального туннеля
      const { default: ProxyChain } = await import('proxy-chain');
      
      let proxyUrl = upstreamProxy.server;
      
      // Если есть credentials, добавляем их в URL
      if (upstreamProxy.username && upstreamProxy.password) {
        console.log('[PROXY TUNNEL] Добавление авторизации');
        const url = new URL(proxyUrl);
        url.username = upstreamProxy.username;
        url.password = upstreamProxy.password;
        proxyUrl = url.toString();
        console.log('[PROXY TUNNEL] URL с авторизацией создан');
      } else {
        console.log('[PROXY TUNNEL] Авторизация не требуется');
      }

      // Создаем анонимный туннель
      console.log('[PROXY TUNNEL] Вызов anonymizeProxy...');
      const anonymousProxy = await ProxyChain.anonymizeProxy(proxyUrl);
      
      console.log(`[PROXY] Туннель создан: ${anonymousProxy} -> ${upstreamProxy.server}`);
      
      this.tunnels.set(anonymousProxy, proxyUrl);
      
      return {
        server: anonymousProxy,
        original: upstreamProxy.server,
      };
    } catch (error) {
      console.error('[PROXY] Ошибка создания туннеля:', error);
      console.error('[PROXY] Stack:', error.stack);
      // Fallback: возвращаем прокси как есть
      return {
        server: upstreamProxy.server,
        username: upstreamProxy.username,
        password: upstreamProxy.password,
      };
    }
  }

  async close(proxyUrl) {
    try {
      const { default: ProxyChain } = await import('proxy-chain');
      await ProxyChain.closeAnonymizedProxy(proxyUrl);
      this.tunnels.delete(proxyUrl);
      console.log(`[PROXY] Туннель закрыт: ${proxyUrl}`);
    } catch (error) {
      console.error('[PROXY] Ошибка закрытия туннеля:', error);
    }
  }

  async closeAll() {
    for (const [proxyUrl] of this.tunnels) {
      await this.close(proxyUrl);
    }
  }
}

/**
 * Главный класс лаунчера
 */
class AdvancedAntidetectLauncher {
  constructor() {
    this.fingerprintGenerator = new FingerprintGenerator();
    this.proxyTunnel = new ProxyTunnel();
  }

  async launch(config) {
    const {
      browserType = 'chromium', // chromium | firefox | camoufox
      profileDir,
      userAgent,
      screen,
      proxy,
      url = 'https://whoer.net',
      antidetect = ANTIDETECT_CONFIG,
      os = 'windows',
    } = config;

    console.log(`[LAUNCH] Запуск ${browserType} с антидетектом`);
    console.log('[LAUNCH] Получен proxy:', JSON.stringify(proxy));

    // Генерируем фингерпринт
    const fingerprint = this.fingerprintGenerator.generate(os, {
      userAgent,
      screen,
    });

    console.log('[FINGERPRINT] Сгенерирован:', {
      userAgent: fingerprint.userAgent,
      platform: fingerprint.platform,
      screen: fingerprint.screen,
      webgl: fingerprint.webgl,
    });

    // Настраиваем прокси
    let proxyConfig = null;
    if (proxy && proxy.server) {
      console.log('[PROXY] Настройка прокси, входные данные:', {
        server: proxy.server,
        hasUsername: !!proxy.username,
        hasPassword: !!proxy.password,
      });
      proxyConfig = await this.proxyTunnel.create(proxy);
      console.log('[PROXY] Настроен:', proxyConfig.server);
    } else {
      console.log('[PROXY] Прокси не используется');
    }

    // Базовые аргументы браузера
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--start-maximized',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security', // Только для тестирования
    ];

    // WebRTC protection
    if (antidetect.webrtc.block) {
      args.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
    }

    // Выбираем браузер
    let browser, context, page;
    
    if (browserType === 'firefox' || browserType === 'camoufox') {
      // Firefox / Camoufox (лучше для антидетекта)
      browser = firefox;
      
      const firefoxArgs = [
        '-profile', profileDir,
        '-no-remote',
      ];

      const launchOptions = {
        headless: false,
        args: firefoxArgs,
        firefoxUserPrefs: {
          // Приватность
          'privacy.trackingprotection.enabled': true,
          'privacy.donottrackheader.enabled': false, // DNT устарел
          'dom.webdriver.enabled': false,
          
          // WebRTC
          'media.peerconnection.enabled': !antidetect.webrtc.block,
          'media.navigator.enabled': !antidetect.webrtc.block,
          
          // Canvas
          'privacy.resistFingerprinting': false, // Мы используем свою защиту
          
          // Performance
          'browser.cache.disk.enable': true,
          'browser.cache.memory.enable': true,
        },
      };

      if (proxyConfig) {
        launchOptions.proxy = {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      context = await browser.launchPersistentContext(profileDir, launchOptions);
      page = context.pages()[0] || await context.newPage();
      
    } else {
      // Chromium
      browser = chromium;
      
      const launchOptions = {
        headless: false,
        args,
      };

      if (proxyConfig) {
        launchOptions.proxy = {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      context = await browser.launchPersistentContext(profileDir, launchOptions);
      page = context.pages()[0] || await context.newPage();
    }

    // Устанавливаем viewport
    await page.setViewportSize(fingerprint.viewport);

    // Инжектим антидетект скрипты
    await page.addInitScript(getAntidetectScripts(fingerprint, antidetect));

    // Дополнительные скрипты для улучшения stealth
    await page.addInitScript(() => {
      // Переопределяем Date.prototype.getTimezoneOffset
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = function() {
        return -180; // Europe/Moscow offset
      };

      // Battery API
      if (navigator.getBattery) {
        navigator.getBattery = () => Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1,
          addEventListener: () => {},
          removeEventListener: () => {},
        });
      }
    });

    console.log('[LAUNCH] Браузер запущен, открываем:', url);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
    } catch (error) {
      console.warn('[LAUNCH] Таймаут загрузки страницы:', error.message);
    }

    // Проверяем IP через браузер
    try {
      const detectedIP = await page.evaluate(() =>
        fetch('https://api.ipify.org?format=json')
          .then(r => r.json())
          .then(data => data.ip)
          .catch(() => null)
      );
      
      if (detectedIP) {
        console.log(`[IP] Обнаружен IP: ${detectedIP}`);
      }
    } catch (e) {
      // ignore
    }

    // Держим браузер открытым
    console.log('[LAUNCH] Браузер готов к работе. Ожидание закрытия...');

    try {
      await context.waitForEvent('close', { timeout: 0 });
    } catch (e) {
      // ignore
    }

    // Cleanup
    try {
      await context.close();
    } catch (e) {
      // ignore
    }

    if (proxyConfig) {
      await this.proxyTunnel.close(proxyConfig.server);
    }

    console.log('[LAUNCH] Завершено');
    process.exit(0);
  }
}

// Entry point
async function main() {
  try {
    const payloadB64 = process.argv.find(arg => arg.startsWith('--payload='))?.split('=')[1];
    
    if (!payloadB64) {
      throw new Error('Missing --payload argument');
    }

    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const payload = JSON.parse(json);

    const launcher = new AdvancedAntidetectLauncher();
    await launcher.launch(payload);
    
  } catch (error) {
    console.error('[ERROR]', error);
    process.exit(1);
  }
}

main();
