// Cookie Robot - Автоматическая нагулка cookies для профилей
// Как у Dolphin Anty: робот открывает браузер и ходит по популярным сайтам,
// чтобы собрать реальные cookies и сделать профиль "прогретым"

import { invoke } from '@tauri-apps/api/core';

// Категории сайтов для нагулки
const COOKIE_SITES: Record<string, string[]> = {
  social: [
    'https://facebook.com',
    'https://twitter.com',
    'https://instagram.com',
    'https://reddit.com',
    'https://linkedin.com',
    'https://pinterest.com',
    'https://tiktok.com',
  ],
  shopping: [
    'https://amazon.com',
    'https://ebay.com',
    'https://aliexpress.com',
    'https://walmart.com',
    'https://etsy.com',
  ],
  news: [
    'https://cnn.com',
    'https://bbc.com',
    'https://nytimes.com',
    'https://reuters.com',
    'https://theguardian.com',
    'https://forbes.com',
  ],
  tech: [
    'https://google.com',
    'https://youtube.com',
    'https://wikipedia.org',
    'https://github.com',
    'https://stackoverflow.com',
    'https://medium.com',
  ],
  entertainment: [
    'https://twitch.tv',
    'https://spotify.com',
    'https://netflix.com',
    'https://imdb.com',
  ],
  finance: [
    'https://yahoo.com/finance',
    'https://coinmarketcap.com',
    'https://tradingview.com',
  ],
};

export type CookieBotCategory = keyof typeof COOKIE_SITES;

export interface CookieBotConfig {
  categories: CookieBotCategory[];
  sitesPerCategory: number;     // Сколько сайтов из каждой категории
  timePerSite: number;          // Секунд на каждый сайт (5-30)
  scrollPages: boolean;         // Прокручивать страницы
  clickLinks: boolean;          // Кликать по ссылкам
  maxTotalTime: number;         // Максимальное время работы (минуты)
  randomOrder: boolean;         // Случайный порядок сайтов
  customSites: string[];        // Пользовательские сайты
}

export interface CookieBotStatus {
  isRunning: boolean;
  profileId: string;
  currentSite: string;
  visitedSites: number;
  totalSites: number;
  cookiesCollected: number;
  progress: number;              // 0-100
  startedAt: string;
  error: string | null;
}

// Состояние всех запущенных роботов
const runningBots = new Map<string, CookieBotStatus>();

/**
 * Получает конфиг по умолчанию
 */
export function getDefaultCookieBotConfig(): CookieBotConfig {
  return {
    categories: ['social', 'shopping', 'news', 'tech'],
    sitesPerCategory: 3,
    timePerSite: 10,
    scrollPages: true,
    clickLinks: true,
    maxTotalTime: 15,
    randomOrder: true,
    customSites: [],
  };
}

/**
 * Собирает список URL для обхода
 */
export function buildSiteList(config: CookieBotConfig): string[] {
  let sites: string[] = [];
  
  for (const category of config.categories) {
    const categorySites = COOKIE_SITES[category] || [];
    const selected = categorySites.slice(0, config.sitesPerCategory);
    sites.push(...selected);
  }
  
  // Добавляем пользовательские сайты
  if (config.customSites.length > 0) {
    sites.push(...config.customSites.filter(s => s.startsWith('http')));
  }
  
  // Перемешиваем если нужно
  if (config.randomOrder) {
    sites = sites.sort(() => Math.random() - 0.5);
  }
  
  return sites;
}

/**
 * Запускает Cookie Robot для профиля
 */
export async function startCookieBot(profileId: string, config: CookieBotConfig): Promise<void> {
  if (runningBots.has(profileId)) {
    throw new Error('Cookie Robot уже запущен для этого профиля');
  }
  
  const sites = buildSiteList(config);
  
  const status: CookieBotStatus = {
    isRunning: true,
    profileId,
    currentSite: '',
    visitedSites: 0,
    totalSites: sites.length,
    cookiesCollected: 0,
    progress: 0,
    startedAt: new Date().toISOString(),
    error: null,
  };
  
  runningBots.set(profileId, status);
  
  try {
    // Запускаем робота через Tauri backend
    await invoke('start_cookie_bot', {
      profileId,
      configJson: JSON.stringify({
        sites,
        timePerSite: config.timePerSite,
        scrollPages: config.scrollPages,
        clickLinks: config.clickLinks,
        maxTotalTime: config.maxTotalTime,
      }),
    });
  } catch (error: any) {
    status.isRunning = false;
    status.error = error.message || String(error);
    throw error;
  }
}

/**
 * Останавливает Cookie Robot для профиля  
 */
export async function stopCookieBot(profileId: string): Promise<void> {
  try {
    await invoke('stop_cookie_bot', { profileId });
  } catch (error) {
    console.error('Error stopping cookie bot:', error);
  }
  
  const status = runningBots.get(profileId);
  if (status) {
    status.isRunning = false;
  }
  runningBots.delete(profileId);
}

/**
 * Получает статус Cookie Robot для профиля
 */
export function getCookieBotStatus(profileId: string): CookieBotStatus | null {
  return runningBots.get(profileId) || null;
}

/**
 * Проверяет запущен ли Cookie Robot для профиля
 */
export function isCookieBotRunning(profileId: string): boolean {
  return runningBots.has(profileId) && (runningBots.get(profileId)?.isRunning ?? false);
}

/**
 * Получает все доступные категории
 */
export function getAvailableCategories(): { id: CookieBotCategory; name: string; count: number }[] {
  return [
    { id: 'social', name: 'Соц. сети', count: COOKIE_SITES.social.length },
    { id: 'shopping', name: 'Маркетплейсы', count: COOKIE_SITES.shopping.length },
    { id: 'news', name: 'Новости', count: COOKIE_SITES.news.length },
    { id: 'tech', name: 'Технологии', count: COOKIE_SITES.tech.length },
    { id: 'entertainment', name: 'Развлечения', count: COOKIE_SITES.entertainment.length },
    { id: 'finance', name: 'Финансы', count: COOKIE_SITES.finance.length },
  ];
}

/**
 * Возвращает человеко-читаемое ETA
 */
export function estimateTime(config: CookieBotConfig): string {
  const sites = buildSiteList(config);
  const totalSeconds = sites.length * config.timePerSite;
  const minutes = Math.ceil(totalSeconds / 60);
  
  if (minutes < 1) return 'менее 1 мин.';
  if (minutes === 1) return '~1 минута';
  if (minutes < 5) return `~${minutes} минуты`;
  return `~${minutes} минут`;
}
