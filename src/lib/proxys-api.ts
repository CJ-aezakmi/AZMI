// Proxys.io API Client (v2)
// Документация: https://proxys.world/api/v2/doc
//
// ВАЖНО: Proxys.io не отдаёт CORS-заголовки (а OPTIONS /buy возвращает 405),
// поэтому прямой fetch из webview блокируется. Все запросы идут через
// Tauri-команду `proxys_api_request` (reqwest на стороне Rust).

import { invoke } from '@tauri-apps/api/core';

export const PROXYS_SITE_URL = 'https://proxys.world/?refid=426237';
export const PROXYS_CABINET_URL = 'https://proxys.world/ru/user/settings/api?refid=426237';
export const PROXYS_TOPUP_URL = 'https://proxys.world/ru/user/balance?refid=426237';

// ─── Типы ответов API ──────────────────────────────────────────────────

export interface ProxysApiError {
  code: number;
  message: string | Record<string, string[]>;
}

export interface ProxysBalance {
  user_balance: number;
  currency: string;
}

export interface ProxysCountry {
  country_code: string;
  country_name: string;
}

export interface ProxysTariff {
  count_min: number;
  count_max: number;
  name: string;
  price: number;
  currency: string;
}

export interface ProxysService {
  service_id: number;
  service_name: string;
  service_description?: string;
  /** Доступные периоды аренды в днях: ["30","60","90"] */
  periods: string[];
  available_countries: ProxysCountry[];
  tariffs: ProxysTariff[];
}

export interface ProxysPrice {
  /** Сумма списания в валюте аккаунта */
  price: number;
  currency: string;
  /** Та же сумма в валюте тарифа — API отдаёт эти поля сверх документации */
  tariffPlanPrice?: number;
  tariffPlanCurrency?: string;
  tariffPlanPriceForOneProxy?: number;
}

/**
 * Один IP внутри заказа.
 * ВНИМАНИЕ: документация v2 обещает `port_socks`, но живой API отдаёт
 * `port_socks5`, и порты приходят числами, а не строками. Поддерживаем оба
 * варианта, читать только через getSocksPort()/getHttpPort().
 */
export interface ProxysIpItem {
  ip: string;
  port_socks5?: number | string;
  port_socks?: number | string;
  port_http: number | string;
  port_https?: number | string;
}

/** Заказ с прокси (ответ GET /ip) */
export interface ProxysOrder {
  order_id: number;
  /** Сколько IP в заказе */
  count?: number;
  /** ISO-код страны. В спеке не описан, но API его возвращает */
  country_code?: string;
  ip_version: string;
  username: string;
  password: string;
  /** Пусто, если авторизация по IP не настроена */
  ip_access?: string;
  expires_at: number;
  list_ip: ProxysIpItem[];
}

/** SOCKS5-порт с запасным вариантом на случай старого имени поля */
export function getSocksPort(ip: ProxysIpItem): string {
  const port = ip.port_socks5 ?? ip.port_socks;
  return port != null ? String(port) : '';
}

/** HTTP-порт заказа */
export function getHttpPort(ip: ProxysIpItem): string {
  return ip.port_http != null ? String(ip.port_http) : '';
}

export interface ProxysBuyResult {
  user_email: string;
  order_id: number;
  count: number;
  price: number;
  currency: string;
  status: string;
  created_at: number;
  expires_at: number;
  key: string;
}

export interface BuyProxyParams {
  /** service_id из getServices() */
  service: number;
  count: number;
  /** ISO-код страны, например "US" */
  country: string;
  /** Период аренды в днях: 30 | 60 | 90 */
  period: number;
  /** Пул серверов, если сервис его поддерживает */
  proxy_pool_id?: string;
  /** Выдать прокси на новую пару логин/пароль */
  use_new_user?: boolean;
}

// ─── Транспорт ─────────────────────────────────────────────────────────

/** Ответ API: либо {success:true, data}, либо {success:false, error} */
interface RawResponse<T> {
  success?: boolean;
  data?: T;
  error?: ProxysApiError;
}

/** Ошибка API с сохранённым кодом — по нему различаем «нет заказов» и «неверный ключ» */
export class ProxysError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'ProxysError';
    this.code = code;
  }
}

/** Разворачивает {code, message} в читаемую строку (message бывает объектом с ошибками валидации) */
function formatApiError(error: ProxysApiError): string {
  const { message } = error;
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object') {
    const parts = Object.values(message).flat().filter(Boolean);
    if (parts.length > 0) return parts.join('. ');
  }
  return `Ошибка API (код ${error.code})`;
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  options: { query?: Record<string, string | number | undefined>; body?: Record<string, unknown> } = {},
): Promise<T> {
  // undefined-параметры не отправляем, числа приводим к строкам
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') {
      query[key] = String(value);
    }
  }

  let raw: RawResponse<T>;
  try {
    raw = await invoke<RawResponse<T>>('proxys_api_request', {
      method,
      path,
      query,
      body: options.body ?? null,
    });
  } catch (err) {
    // Tauri отклоняет промис строкой, а не Error — иначе сообщение теряется
    const message = typeof err === 'string' ? err : (err as any)?.message;
    console.error('[Proxys.io] invoke failed:', method, path, err);
    throw new Error(message || 'Не удалось обратиться к Proxys.io');
  }

  if (raw?.error) {
    console.warn('[Proxys.io] API error:', method, path, raw.error);
    throw new ProxysError(formatApiError(raw.error), raw.error.code);
  }
  if (raw?.success === false) {
    throw new Error('Proxys.io отклонил запрос');
  }

  return (raw?.data ?? raw) as T;
}

// ─── Клиент ────────────────────────────────────────────────────────────

export class ProxysClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  /** Баланс аккаунта — используется и как проверка валидности ключа */
  async getBalance(): Promise<ProxysBalance> {
    return request<ProxysBalance>('GET', '/balance', { query: { key: this.apiKey } });
  }

  /** Каталог: типы прокси, доступные страны, тарифы и периоды. Ключ не требуется. */
  async getServices(): Promise<ProxysService[]> {
    const services = await request<ProxysService[]>('GET', '/services', {
      query: { tariff: 1, description: 1 },
    });
    return (services || []).map(service => ({
      ...service,
      // periods приходит объектом-массивом строк — нормализуем в number-friendly строки
      periods: Array.isArray(service.periods) ? service.periods.map(String) : ['30'],
      available_countries: service.available_countries || [],
      tariffs: service.tariffs || [],
    }));
  }

  /** Стоимость заказа до покупки */
  async getPrice(params: { service: number; count: number; country?: string; period?: number }): Promise<ProxysPrice> {
    return request<ProxysPrice>('GET', '/price', {
      query: {
        service: params.service,
        count: params.count,
        country: params.country,
        period: params.period,
      },
    });
  }

  /**
   * Есть ли нужное количество прокси в наличии.
   * API отвечает 200 при наличии и 400 с ошибкой валидации, если не хватает.
   */
  async checkAvailability(params: { service: number; count: number; country: string; server?: string }): Promise<boolean> {
    try {
      await request<unknown>('GET', '/overs/check-available-proxies-count', {
        query: {
          key: this.apiKey,
          service: params.service,
          count: params.count,
          country: params.country,
          server: params.server,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Покупка прокси. Списывает средства с баланса. */
  async buyProxy(params: BuyProxyParams): Promise<ProxysBuyResult> {
    return request<ProxysBuyResult>('POST', '/buy', {
      body: {
        key: this.apiKey,
        service: params.service,
        count: params.count,
        country: params.country,
        period: params.period,
        ...(params.proxy_pool_id ? { proxy_pool_id: params.proxy_pool_id } : {}),
        ...(params.use_new_user ? { use_new_user: true } : {}),
      },
    });
  }

  /** Все купленные прокси, сгруппированные по заказам */
  async getOrders(): Promise<ProxysOrder[]> {
    let data: ProxysOrder | ProxysOrder[];
    try {
      data = await request<ProxysOrder | ProxysOrder[]>('GET', '/ip', {
        query: { key: this.apiKey },
      });
    } catch (err) {
      // Пустой список — это не ошибка: API отвечает 1002 «Orders not found»
      if (err instanceof ProxysError && err.code === 1002) return [];
      throw err;
    }
    // API отдаёт объект при одном заказе и массив при нескольких
    const orders = Array.isArray(data) ? data : data ? [data] : [];
    return orders.map(order => ({ ...order, list_ip: order.list_ip || [] }));
  }

  /** Продление заказа на 30 дней */
  async extendOrder(orderId: number): Promise<ProxysBuyResult> {
    return request<ProxysBuyResult>('POST', '/extending', {
      // В спеке required-полем указан `order`, а в properties — `order_id`.
      // Шлём оба, чтобы не зависеть от расхождения в документации.
      body: { key: this.apiKey, order_id: orderId, order: orderId },
    });
  }

  /** Курс валюты (buy/sell) — для пересчёта цен */
  async getCourses(): Promise<{ buy: number; sell: number }> {
    return request<{ buy: number; sell: number }>('GET', '/courses');
  }
}

// ─── Хранение ключа ────────────────────────────────────────────────────

const API_KEY_STORAGE = 'proxys_api_key';

export function saveProxysApiKey(apiKey: string): void {
  localStorage.setItem(API_KEY_STORAGE, apiKey);
}

export function getProxysApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function removeProxysApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

export function createProxysClient(): ProxysClient | null {
  const apiKey = getProxysApiKey();
  return apiKey ? new ProxysClient(apiKey) : null;
}

// ─── Утилиты ───────────────────────────────────────────────────────────

/** Иконка/категория сервиса по его названию — для подписи карточек в UI */
export function getServiceKind(service: ProxysService): 'ipv4' | 'ipv6' | 'shared' | 'premium' | 'windows' | 'mystery' {
  const name = service.service_name.toLowerCase();
  if (name.includes('surprise')) return 'mystery';
  if (name.includes('windows')) return 'windows';
  if (name.includes('премиал') || name.includes('premium')) return 'premium';
  if (name.includes('расшарен') || name.includes('shared')) return 'shared';
  if (name.includes('ipv6')) return 'ipv6';
  return 'ipv4';
}

/** Минимальная цена сервиса за 1 прокси — для превью в каталоге */
export function getMinPrice(service: ProxysService): ProxysTariff | null {
  if (!service.tariffs?.length) return null;
  return service.tariffs.reduce((min, tariff) => (tariff.price < min.price ? tariff : min), service.tariffs[0]);
}

/** API называет валюту словом ("DOLLARS"), приводим к привычному коду */
export function normalizeCurrency(currency?: string): string {
  if (!currency) return '';
  const map: Record<string, string> = {
    DOLLARS: 'USD',
    DOLLAR: 'USD',
    RUBLES: 'RUB',
    RUBLE: 'RUB',
    EUROS: 'EUR',
    EURO: 'EUR',
  };
  return map[currency.toUpperCase()] || currency;
}

/** Unix-таймстамп → локальная дата */
export function formatExpiry(timestamp: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleDateString();
}

/** Сколько дней осталось до окончания аренды */
export function daysLeft(timestamp: number): number {
  if (!timestamp) return 0;
  return Math.ceil((timestamp * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
}
