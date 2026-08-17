// PSB Proxy API Client
// Документация: https://documenter.getpostman.com/view/32579516/2sAYX2LiVN
//
// Модель отличается от Proxys.io: это резидентные и мобильные пулы с оплатой
// по трафику. Прокси не покупаются поштучно — генерируется список доступов
// к пулу с гео-фильтрами, а расходуется трафик.
//
// Ключевой эндпоинт — GET /api/residential_proxy/{pool} («Get Data»): одним
// запросом отдаёт остаток трафика и все справочники (страны, протоколы,
// ротации, точки входа). Через него же проверяется токен — отдельный
// /subUsers/basic для этого не нужен и отвечает 404, если базового
// суб-пользователя у аккаунта нет.
//
// ВАЖНО: psbproxy.io отдаёт Access-Control-Allow-Origin: https://psbproxy.io,
// поэтому все запросы идут через Tauri-команду `psb_api_request`.

import { invoke } from '@tauri-apps/api/core';

export const PSB_GET_PROXY_URL = 'https://www.aezakmi.app/?utm_source=psb';
export const PSB_SITE_URL = 'https://psbproxy.io';

/** Идентификатор продукта = значение параметра `type` в API */
export type PsbProductId =
  | 'residential-proxy-pool-1'
  | 'mobile-proxy-pool-1'
  | 'datacenter-proxy-pool-1'
  | 'residential-proxy-pool-2';

/** Набор эндпоинтов, которым обслуживается продукт */
export type PsbEndpoint = 'pool-1' | 'pool-2';

export interface PsbProduct {
  id: PsbProductId;
  endpoint: PsbEndpoint;
  /** Ключ строки перевода с названием продукта */
  labelKey: string;
  /** Создание суб-пользователя API поддерживает только для резидентных типов */
  canCreateSubUser: boolean;
}

/**
 * Пул 1 обслуживает два продукта — резидентный и мобильный; они разделяются
 * параметром `type`, который принимают все его эндпоинты.
 */
export const PSB_PRODUCTS: PsbProduct[] = [
  {
    id: 'residential-proxy-pool-1',
    endpoint: 'pool-1',
    labelKey: 'psb.productResidential1',
    canCreateSubUser: true,
  },
  {
    id: 'mobile-proxy-pool-1',
    endpoint: 'pool-1',
    labelKey: 'psb.productMobile1',
    canCreateSubUser: true,
  },
  {
    id: 'datacenter-proxy-pool-1',
    endpoint: 'pool-1',
    labelKey: 'psb.productDatacenter1',
    canCreateSubUser: true,
  },
  {
    id: 'residential-proxy-pool-2',
    endpoint: 'pool-2',
    labelKey: 'psb.productResidential2',
    canCreateSubUser: true,
  },
];

export function getProduct(id: PsbProductId): PsbProduct {
  return PSB_PRODUCTS.find(p => p.id === id) || PSB_PRODUCTS[0];
}

// ─── Типы ──────────────────────────────────────────────────────────────

export interface PsbSubUser {
  id: number;
  type: string;
  data: {
    subuser_id?: number;
    username: string;
    password: string;
    traffic_available: string | number;
    traffic_used: string | number;
  };
}

export interface PsbOption {
  name: string;
  value: string;
}

export interface PsbCountry {
  code: string;
  name: string;
}

export interface PsbGeoItem {
  code: string;
  name: string;
  count?: number;
}

export interface PsbHostname {
  type: 'dns' | 'ip';
  name: string;
  value: string;
}

/** Сырой ответ «Get Data». Состав полей отличается у пулов. */
interface RawPoolData {
  traffic_available?: string | number;
  available_hostnames?: PsbHostname[];
  available_countries?: unknown;
  available_formats?: PsbOption[];
  available_rotations?: PsbOption[];
  available_protocols?: PsbOption[];
  entry_nodes?: { dns: string; ips: string[]; ports: { name: string; port: number }[] }[];
}

/** Нормализованные данные пула — всё, что нужно интерфейсу */
export interface PsbPoolData {
  trafficAvailable: number;
  countries: PsbCountry[];
  protocols: PsbOption[];
  rotations: PsbOption[];
  hostnames: PsbHostname[];
  formats: PsbOption[];
}

export interface GenerateParams {
  product: PsbProductId;
  hostname: string;
  protocol: string;
  rotation: string;
  count: number;
  countries?: string[];
  states?: string[];
  cities?: string[];
  asns?: string[];
  sessionMinutes?: number;
  subUserId?: number;
}

export interface PsbProxyLine {
  host: string;
  port: string;
  username: string;
  password: string;
}

/** Сырой тариф из /api/products */
interface RawShopProduct {
  id: number;
  title?: string;
  type?: string;
  price?: number | string;
  status?: boolean;
  data?: { traffic?: string | number; price_per_gb?: string | number; discount?: string | number };
}

/** Тариф магазина PSB */
export interface PsbShopProduct {
  id: number;
  title: string;
  productType: PsbProductId;
  /** Цена пакета в долларах */
  price: number;
  /** Сколько гигабайт в пакете */
  trafficGb: number;
  pricePerGb: number;
  /** Скидка в процентах */
  discount: number;
}

// ─── Транспорт ─────────────────────────────────────────────────────────

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  token: string,
  options: {
    query?: Record<string, string | number | undefined>;
    json?: Record<string, unknown>;
    form?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') query[key] = String(value);
  }

  let form: Record<string, string> | null = null;
  if (options.form) {
    form = {};
    for (const [key, value] of Object.entries(options.form)) {
      if (value !== undefined && value !== null && value !== '') form[key] = String(value);
    }
  }

  try {
    return await invoke<T>('psb_api_request', {
      method,
      path,
      token,
      query,
      jsonBody: options.json ?? null,
      formBody: form,
    });
  } catch (err) {
    // Tauri отклоняет промис строкой, а не Error
    const message = typeof err === 'string' ? err : (err as any)?.message;
    console.error('[PSB] request failed:', method, path, err);
    throw new Error(message || 'Не удалось обратиться к PSB Proxy');
  }
}

// ─── Нормализация справочников ─────────────────────────────────────────

function normalizeCountries(raw: unknown, endpoint: PsbEndpoint): PsbCountry[] {
  if (endpoint === 'pool-1') {
    const list = (raw as { country_code: string; country_name: string }[]) || [];
    return list.map(c => ({ code: c.country_code, name: c.country_name }));
  }
  // Пул 2 отдаёт объект с префиксами и вложенными регионами/городами
  const data = (raw as { countries?: { code: string; name: string }[] }) || {};
  return (data.countries || []).map(c => ({ code: c.code, name: c.name }));
}

function normalizeHostnames(data: RawPoolData, endpoint: PsbEndpoint): PsbHostname[] {
  if (endpoint === 'pool-1') return data.available_hostnames || [];

  const result: PsbHostname[] = [];
  for (const node of data.entry_nodes || []) {
    if (node.dns) result.push({ type: 'dns', name: node.dns, value: node.dns });
    for (const ip of node.ips || []) result.push({ type: 'ip', name: ip, value: ip });
  }
  return result;
}

function normalizeProtocols(data: RawPoolData, endpoint: PsbEndpoint): PsbOption[] {
  if (endpoint === 'pool-1') {
    return data.available_protocols || [{ name: 'HTTP', value: 'http' }];
  }
  // У пула 2 протокол задаётся именем порта из entry_nodes
  const ports = data.entry_nodes?.[0]?.ports || [];
  const options = ports.map(p => ({ name: p.name.toUpperCase(), value: p.name }));
  return options.length > 0
    ? options
    : [
        { name: 'HTTP|HTTPS', value: 'http|https' },
        { name: 'SOCKS5', value: 'socks5' },
      ];
}

// ─── Клиент ────────────────────────────────────────────────────────────

export class PsbClient {
  private token: string;

  constructor(token: string) {
    this.token = token.trim();
  }

  private base(endpoint: PsbEndpoint): string {
    return `/api/residential_proxy/${endpoint}`;
  }

  /**
   * «Get Data» — остаток трафика и все справочники продукта одним запросом.
   *
   * Все эндпоинты данных PSB привязаны к суб-пользователю. Явный `subUser_id`
   * надёжнее всего; без него сервер ищет суб-пользователя по `type`, а если
   * и его не передать — берёт продукт по умолчанию. Пробуем по очереди, потому
   * что у разных аккаунтов срабатывает разный вариант.
   */
  async getPoolData(productId: PsbProductId, subUserId?: number): Promise<PsbPoolData> {
    const product = getProduct(productId);

    const variants: Record<string, string | number | undefined>[] = [];
    if (subUserId != null) variants.push({ subUser_id: subUserId, type: product.id });
    variants.push({ type: product.id });
    // В Postman-коллекции оба параметра выключены — значит запрос без них штатный
    if (product.id === 'residential-proxy-pool-1' || product.endpoint === 'pool-2') {
      variants.push({});
    }

    let lastError: unknown;
    for (const query of variants) {
      try {
        const raw = await request<RawPoolData>('GET', this.base(product.endpoint), this.token, {
          query,
        });
        return {
          trafficAvailable: trafficGb(raw.traffic_available),
          countries: normalizeCountries(raw.available_countries, product.endpoint),
          protocols: normalizeProtocols(raw, product.endpoint),
          rotations: raw.available_rotations || [],
          hostnames: normalizeHostnames(raw, product.endpoint),
          formats: raw.available_formats || [],
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Определяет доступные продукты. Идём от списка суб-пользователей аккаунта:
   * именно к ним привязаны данные. Если список пуст — пробуем продукты вслепую,
   * вдруг у аккаунта есть суб-пользователь по умолчанию.
   */
  async discoverProducts(): Promise<{
    products: { product: PsbProduct; data: PsbPoolData }[];
    subUsers: PsbSubUser[];
  }> {
    const subUsers = await this.listSubUsers().catch(err => {
      console.warn('[PSB] список суб-пользователей недоступен:', err);
      return [] as PsbSubUser[];
    });
    console.info('[PSB] суб-пользователей на аккаунте:', subUsers.length, subUsers);

    // Продукты, под которые у аккаунта есть суб-пользователь, проверяем по его id
    const targets: { product: PsbProduct; subUserId?: number }[] = subUsers
      .map(user => {
        const product = PSB_PRODUCTS.find(p => p.id === user.type);
        return product ? { product, subUserId: user.id } : null;
      })
      .filter(Boolean) as { product: PsbProduct; subUserId?: number }[];

    for (const product of PSB_PRODUCTS) {
      if (!targets.some(target => target.product.id === product.id)) targets.push({ product });
    }

    const results = await Promise.all(
      targets.map(async ({ product, subUserId }) => {
        try {
          return { product, data: await this.getPoolData(product.id, subUserId) };
        } catch (err) {
          console.warn('[PSB] продукт недоступен:', product.id, err);
          return null;
        }
      }),
    );

    return {
      products: results.filter(Boolean) as { product: PsbProduct; data: PsbPoolData }[],
      subUsers,
    };
  }

  /** Регионы выбранных стран */
  async getStates(productId: PsbProductId, countries: string[]): Promise<PsbGeoItem[]> {
    const product = getProduct(productId);
    if (product.endpoint === 'pool-1') {
      return request<PsbGeoItem[]>('POST', `${this.base('pool-1')}/available_states`, this.token, {
        json: { type: product.id, countries },
      });
    }
    const data = await request<{ states: PsbGeoItem[] }>(
      'GET',
      `${this.base('pool-2')}/available_states`,
      this.token,
      { query: { country: countries[0] } },
    );
    return data?.states || [];
  }

  /** Города выбранных стран */
  async getCities(
    productId: PsbProductId,
    countries: string[],
    states: string[] = [],
  ): Promise<PsbGeoItem[]> {
    const product = getProduct(productId);
    if (product.endpoint === 'pool-1') {
      return request<PsbGeoItem[]>('POST', `${this.base('pool-1')}/available_cities`, this.token, {
        json: { type: product.id, countries, states },
      });
    }
    const data = await request<{ cities?: PsbGeoItem[] }>(
      'GET',
      `${this.base('pool-2')}/available_cities`,
      this.token,
      { query: { country: countries[0] } },
    );
    return data?.cities || [];
  }

  /** ASN — только у пула 1 */
  async getAsns(
    productId: PsbProductId,
    countries: string[],
    states: string[] = [],
  ): Promise<PsbGeoItem[]> {
    const product = getProduct(productId);
    if (product.endpoint !== 'pool-1') return [];
    return request<PsbGeoItem[]>('POST', `${this.base('pool-1')}/available_asns`, this.token, {
      json: { type: product.id, countries, states },
    });
  }

  /** Генерация списка прокси. Возвращает сырые строки провайдера. */
  async generateProxyList(params: GenerateParams): Promise<string[]> {
    const product = getProduct(params.product);

    const form: Record<string, string | number | undefined> =
      product.endpoint === 'pool-1'
        ? {
            type: product.id,
            subUser_id: params.subUserId,
            hostname: params.hostname,
            format: 'hostname:port:login:password',
            protocol: params.protocol,
            rotation: params.rotation,
            proxy_count: params.count,
            location: params.countries?.join(','),
            states: params.states?.join(','),
            cities: params.cities?.join(','),
            asns: params.asns?.join(','),
            sessionttl: params.rotation === 'sticky' ? params.sessionMinutes : undefined,
          }
        : {
            subUser_id: params.subUserId,
            hostname: params.hostname,
            format: '{hostname}:{port}:{username}:{password}',
            port: params.protocol,
            rotation: params.rotation,
            proxy_count: params.count,
            location: buildPool2Location(params),
            lifetime:
              params.rotation === 'sticky' && params.sessionMinutes
                ? `${params.sessionMinutes}m`
                : undefined,
          };

    const list = await request<string[]>(
      'POST',
      `${this.base(product.endpoint)}/generate-proxy-list`,
      this.token,
      { form },
    );
    return Array.isArray(list) ? list : [];
  }

  /** Сброс sticky-сессии на конкретном порту (пул 1) */
  async rotateIp(productId: PsbProductId, port: string): Promise<void> {
    const product = getProduct(productId);
    await request<unknown>('POST', `${this.base(product.endpoint)}/rotate-ip`, this.token, {
      form: { type: product.id, port },
    });
  }

  // ─── Магазин ─────────────────────────────────────────────────────────

  /**
   * Каталог тарифов. Эндпоинт не описан в Postman-коллекции, но именно он —
   * недостающее звено: базовый суб-пользователь появляется у аккаунта только
   * после покупки трафика, а купить его можно отсюда.
   * Авторизация не требуется, цены и скидки берём живыми, а не хардкодом.
   */
  async getShopProducts(): Promise<PsbShopProduct[]> {
    const raw = await request<RawShopProduct[]>('GET', '/api/products', this.token);
    return (raw || [])
      .filter(item => item.status !== false && /proxy-pool/.test(item.type || ''))
      .map(item => ({
        id: item.id,
        title: item.title || `#${item.id}`,
        productType: item.type as PsbProductId,
        price: Number(item.price) || 0,
        trafficGb: Number(item.data?.traffic) || 0,
        pricePerGb: Number(item.data?.price_per_gb) || 0,
        discount: Number(item.data?.discount) || 0,
      }))
      .sort((a, b) => a.trafficGb - b.trafficGb);
  }

  /**
   * Покупка тарифа с баланса аккаунта PSB. `amount` — число единиц пакета
   * (на пакете «1 GB» amount=5 даст 5 ГБ).
   * Часть установок принимает JSON, часть — форму, поэтому пробуем оба.
   */
  async buyProduct(productId: number, amount = 1): Promise<unknown> {
    const path = `/api/products/${productId}/buy`;
    try {
      return await request<unknown>('POST', path, this.token, {
        json: { payment_type: 'balance', ...(amount > 1 ? { amount } : {}) },
      });
    } catch (err) {
      console.warn('[PSB] покупка JSON-телом не прошла, пробуем форму:', err);
      return request<unknown>('POST', path, this.token, {
        form: { payment_type: 'balance', ...(amount > 1 ? { amount } : {}) },
      });
    }
  }

  /**
   * Полный цикл подключения продукта: купить трафик → завести суб-пользователя
   * → перевести на него купленное. Первый шаг обязателен: без покупки у
   * аккаунта нет базового суб-пользователя и создание отвечает
   * «Basic SubUser not found».
   */
  async provisionProduct(
    productType: PsbProductId,
    shopProductId: number,
    units: number,
    trafficGb: number,
  ): Promise<{ subUser: PsbSubUser; trafficMoved: boolean }> {
    await this.buyProduct(shopProductId, units);

    const subUser = await this.createSubUser(productType);

    // Перевод не критичен: если не вышло, трафик остаётся на основном балансе
    let trafficMoved = false;
    try {
      const amount = Math.floor(trafficGb * units);
      if (amount > 0) {
        await this.giveTraffic(subUser.id, amount);
        trafficMoved = true;
      }
    } catch (err) {
      console.warn('[PSB] трафик куплен, но не переведён на суб-аккаунт:', err);
    }

    return { subUser, trafficMoved };
  }

  // ─── Суб-пользователи ────────────────────────────────────────────────

  async listSubUsers(): Promise<PsbSubUser[]> {
    const response = await request<{ data: PsbSubUser[] }>('GET', '/api/subUsers', this.token, {
      query: { page: 1, pageSize: 100 },
    });
    return response?.data || [];
  }

  /**
   * Создаёт суб-пользователя. Проверено живым API: пул 1 принимает только
   * `type` — оба написания поля с трафиком он отвергает как неизвестный ключ.
   * Требует существующего базового суб-пользователя, иначе отвечает
   * «Basic SubUser not found».
   */
  async createSubUser(productId: PsbProductId, amountGb?: number): Promise<PsbSubUser> {
    const product = getProduct(productId);
    return request<PsbSubUser>('POST', '/api/subUsers', this.token, {
      form:
        product.endpoint === 'pool-2' && amountGb
          ? { type: product.id, available_traffic: amountGb }
          : { type: product.id },
    });
  }

  /** Переводит трафик с основного баланса на суб-пользователя */
  async giveTraffic(subUserId: number, amount: number): Promise<PsbSubUser> {
    return request<PsbSubUser>('POST', `/api/subUsers/${subUserId}/give-traffic`, this.token, {
      form: { amount },
    });
  }

  /** Возвращает трафик суб-пользователя на основной баланс */
  async takeTraffic(subUserId: number, amount: number): Promise<PsbSubUser> {
    return request<PsbSubUser>('POST', `/api/subUsers/${subUserId}/take-traffic`, this.token, {
      form: { amount },
    });
  }
}

/** Пул 2 принимает гео одной строкой вида "_country-ae_city-abudhabi" */
function buildPool2Location(params: GenerateParams): string | undefined {
  const country = params.countries?.[0];
  if (!country) return undefined;
  let location = `_country-${country}`;
  if (params.states?.[0]) location += `_state-${params.states[0]}`;
  if (params.cities?.[0]) location += `_city-${params.cities[0]}`;
  return location;
}

/**
 * Разбор строки формата `hostname:port:login:password`.
 * Пароль может содержать двоеточия, поэтому режем только первые три.
 */
export function parseProxyLine(line: string): PsbProxyLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length < 4) return null;

  const [host, port, username, ...rest] = parts;
  if (!host || !port) return null;

  return { host, port, username, password: rest.join(':') };
}

// ─── Хранение токена ───────────────────────────────────────────────────

const TOKEN_STORAGE = 'psb_api_token';

export function savePsbToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE, token);
}

export function getPsbToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE);
}

export function removePsbToken(): void {
  localStorage.removeItem(TOKEN_STORAGE);
}

/** Гигабайты трафика: API отдаёт их то строкой, то числом */
export function trafficGb(value?: string | number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}
