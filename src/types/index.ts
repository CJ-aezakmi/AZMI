// src/types/index.ts — УЛУЧШЕННАЯ ВЕРСИЯ С РАСШИРЕННЫМ АНТИДЕТЕКТОМ
export interface Proxy {
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
export type BrowserEngine = 'chromium' | 'firefox' | 'camoufox' | 'webkit';

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
  // Optional freeform notes attached to profile
  notes?: string;
  folder?: string; // Папка для группировки профилей
  proxy?: Proxy; // Опциональный, а не null - так правильнее
  antidetect: Antidetect;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  status: 'ready' | 'active' | 'inactive';
  
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
}