// src/types/index.ts — УЛУЧШЕННАЯ ВЕРСИЯ С РАСШИРЕННЫМ АНТИДЕТЕКТОМ
export interface Proxy {
  id?: string;
  name?: string;
  enabled: boolean;
  type: 'http' | 'https' | 'socks5' | 'socks4';
  host: string;
  port: string | number; // Поддержка обоих типов для совместимости
  // Поддерживаем оба поля для совместимости с разными частями кода
  login?: string;
  username?: string;
  password?: string;
  // runtime status set by proxy tester
  status?: 'working' | 'failed' | 'unchecked';
  // Для локального туннеля
  tunnelPort?: number;
  tunnelActive?: boolean;
  // Метаданные для интеграций (SX.ORG и др.)
  metadata?: {
    sxorg_id?: number;
    refresh_link?: string;
    country?: string;
    state?: string;
    city?: string;
    [key: string]: any;
  };
}

// Расширенная WebGL конфигурация
export interface WebGLConfig {
  vendor: string;
  renderer: string;
  noise?: boolean;
}

// Конфигурация Canvas
export interface CanvasConfig {
  noise: boolean;
  noiseLevel?: number; // 0.1 - 1.0
}

// Конфигурация Audio
export interface AudioConfig {
  noise: boolean;
  contextNoise?: number; // Уровень шума для AudioContext
}

// Расширенная конфигурация WebRTC
export interface WebRTCConfig {
  block: boolean;
  replacePublicIP?: boolean;
  replaceLocalIP?: boolean;
  customIP?: string;
}

// Конфигурация шрифтов
export interface FontsConfig {
  restrict?: boolean;
  whitelist?: string[];
}

// Расширенный антидетект с реалистичными параметрами
export interface Antidetect {
  // Базовые параметры (обратная совместимость)
  canvasNoise: boolean;
  webglNoise: boolean;
  audioNoise: boolean;
  blockWebRTC: boolean;
  spoofGeolocation: boolean;
  geolocation?: {
    latitude: number;
    longitude: number;
  };

  // Расширенные параметры
  canvas?: CanvasConfig;
  webgl?: WebGLConfig;
  audio?: AudioConfig;
  webrtc?: WebRTCConfig;
  fonts?: FontsConfig;

  // Дополнительные параметры браузера
  hardwareConcurrency?: number; // Количество ядер CPU
  deviceMemory?: number; // GB памяти
  doNotTrack?: boolean | null; // null = не отправлять DNT заголовок

  // Fingerprint features
  hideAutomation?: boolean; // Скрыть navigator.webdriver
  spoofPlugins?: boolean; // Подменить список плагинов
  spoofBattery?: boolean; // Подменить Battery API

  // Продвинутые настройки
  customFingerprint?: string; // JSON строка с кастомным фингерпринтом
}

// Типы браузеров
export type BrowserEngine = 'chromium';

// Эмуляция мобильного устройства
export interface MobileEmulation {
  enabled: boolean;
  deviceName?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  userAgent?: string;
}

// Предустановки мобильных устройств
export const MOBILE_DEVICES: Record<string, MobileEmulation> = {
  'iPhone 14': { enabled: true, deviceName: 'iPhone 14', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  'iPhone 15 Pro': { enabled: true, deviceName: 'iPhone 15 Pro', width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'Pixel 7': { enabled: true, deviceName: 'Pixel 7', width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' },
  'Samsung Galaxy S23': { enabled: true, deviceName: 'Samsung Galaxy S23', width: 360, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' },
  'iPad Air': { enabled: true, deviceName: 'iPad Air', width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
};

export interface Profile {
  id: string;
  name: string;
  browserEngine?: BrowserEngine; // Выбор движка браузера
  os?: string; // 'windows' | 'macos' | 'linux'
  userAgent: string;
  language: string;
  windowWidth?: number;
  windowHeight?: number;
  // Optional more detailed screen dimensions (some UI expects these)
  screenWidth: number;
  screenHeight: number;
  timezone?: string;
  homepage?: string; // Домашняя страница, загружаемая при запуске браузера
  // Optional freeform notes attached to profile
  notes?: string;
  folder?: string; // Папка для группировки профилей
  proxy?: Proxy; // Опциональный, а не null - так правильнее
  antidetect: Antidetect;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  status: 'ready' | 'active' | 'inactive';
  // Мобильная эмуляция
  mobileEmulation?: MobileEmulation;
  // Cookie robot
  cookieBotLastRun?: string;
  // Импортированные cookies (формат Netscape/JSON)
  cookies?: CookieEntry[];

  // Дополнительные метаданные
  lastUsed?: string;
  usageCount?: number;
}

// Конфигурация для запуска профиля
export interface LaunchConfig {
  profileDir: string;
  browserType: BrowserEngine;
  userAgent?: string;
  screen?: { width: number; height: number };
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  url?: string;
  antidetect?: Antidetect;
  os?: string;
  mobileEmulation?: MobileEmulation;
  locale?: string; // Язык браузера (например, 'ru-RU', 'en-US')
  timezoneId?: string; // Часовой пояс (например, 'Europe/Moscow', 'America/New_York')
  autoDetectLocale?: boolean; // Флаг: определить timezone/language по реальному исходящему IP прокси
  cookies?: CookieEntry[]; // Cookies для загрузки в браузер
}

// Cookie запись для импорта/экспорта
export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}