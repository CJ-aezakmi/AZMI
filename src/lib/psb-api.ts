// PSB Proxy API Client
// Документация (OpenAPI): https://psbproxy.io/api/docs/
// Старая Postman-коллекция: https://documenter.getpostman.com/view/32579516/2sAYX2LiVN
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

/** Регистрация и получение API-токена */
export const PSB_GET_PROXY_URL = 'https://psbproxy.io/?utm_source=aezakmi';
/** Пополнение баланса аккаунта PSB */
export const PSB_WALLET_URL = 'https://psbproxy.io/account/wallet';
export const PSB_SITE_URL = 'https://psbproxy.io';
/** Статичные прокси на сайте PSB (описание тарифов) */
export const PSB_STATIC_SITE_URL = 'https://psbproxy.io/prices/static-datacenter-proxy?utm_source=aezakmi';

/** Идентификатор продукта = значение параметра `type` в API */
export type PsbProductId =
  | 'residential-proxy-pool-3'
  | 'residential-proxy-pool-1'
  | 'mobile-proxy-pool-1'
  | 'datacenter-proxy-pool-1'
  | 'residential-proxy-pool-2';

/** Набор эндпоинтов, которым обслуживается продукт */
export type PsbEndpoint = 'pool-1' | 'pool-2' | 'pool-3';

export interface PsbProduct {
  id: PsbProductId;
  endpoint: PsbEndpoint;
  /** Ключ строки перевода с названием продукта */
  labelKey: string;
  /** Создание суб-пользователя API поддерживает только для резидентных типов */
  canCreateSubUser: boolean;
  /** Регион и город нельзя задать одновременно (ограничение пула 3) */
  exclusiveStateCity?: boolean;
  /** Минимальное время sticky-сессии в минутах */
  stickyMinMinutes?: number;
}

/**
 * Пул 3 — текущий основной тариф PSB («Best price», с 29.09.2026), у него
 * собственный набор эндпоинтов без параметра `type`.
 * Пул 1 обслуживает три продукта — резидентный, мобильный и датацентр; они
 * разделяются параметром `type`, который принимают все его эндпоинты.
 * Пул 2 снят с продажи, но остаётся для аккаунтов со старыми суб-пользователями.
 */
export const PSB_PRODUCTS: PsbProduct[] = [
  {
    id: 'residential-proxy-pool-3',
    endpoint: 'pool-3',
    labelKey: 'psb.productResidential3',
    canCreateSubUser: true,
    exclusiveStateCity: true,
    stickyMinMinutes: 3,
  },
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

/** Сырой ответ магазина для статичного пакета */
interface RawStaticPackageData {
  package_id?: string | number;
  ip_count?: number;
  category_id?: number;
  category_name?: string;
  usage_based?: boolean;
}

/** Статичный пакет в каталоге PSB (цена за IP в месяц) */
export interface PsbStaticPackage {
  id: number;
  title: string;
  /** Цена за один IP в месяц, $ */
  pricePerIp: number;
  ipCount: number;
  categoryName: string;
}

/**
 * Учётные данные статичного прокси. Проверено живым API 24.11.2026: PSB кладёт
 * их в `ip_addresses: {login, password, ips: ["ip:port"]}` (в OpenAPI-схеме
 * ошибочно указан массив строк). Один порт обслуживает и HTTP, и SOCKS5.
 */
export interface PsbStaticCredentials {
  login?: string;
  password?: string;
  port?: string;
  socksPort?: string;
  hostname?: string;
}

/** Назначение статичного пакета (Amazon, Bing, …) и сколько IP есть по странам */
export interface PsbStaticPurpose {
  id: number;
  name: string;
  /** Название страны → доступно IP. Ключ «Any» — без привязки к стране */
  countries: Record<string, number>;
}

export interface PsbStaticPackageDetails {
  purposes: PsbStaticPurpose[];
  usageBased: boolean;
}

export interface BuyStaticParams {
  /** id продукта каталога (`static-proxy-package`) */
  productId: number;
  purposeId: number;
  /** Название страны как в справочнике назначений, например "United States" или "Any" */
  country: string;
  count: number;
  autoRenewal: boolean;
}

/** Подписка на статичные прокси (GET /static-proxy/subscriptions) */
export interface PsbStaticSubscription {
  id: number;
  title: string;
  status: 'active' | 'cancelled' | 'expired' | string;
  country: string | null;
  categoryName: string | null;
  purposeName: string | null;
  ipAddresses: string[];
  ipCount: number;
  autoRenewal: boolean;
  expiresAt: string | null;
  renewableUntil: string | null;
  notes: string | null;
  /** Данные не удалось обновить с живого статуса */
  stale: boolean;
  /** Что удалось распознать из ответа; null — учётки нужно ввести вручную */
  credentials: PsbStaticCredentials | null;
  /** Готовые строки `host:port:login:password`, если PSB их отдаёт */
  proxyLines: string[];
  raw: Record<string, unknown>;
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

/**
 * Страны приходят в разной форме: пул 1 — `{country_code, country_name}`,
 * отдельные справочники — `{code, name}`, пул 2 — объект `{countries: [...]}`.
 * Для пула 3 форма «Get Data» в документации не описана, поэтому разбираем
 * всё, что похоже на список стран.
 */
function normalizeCountries(raw: unknown): PsbCountry[] {
  const list = Array.isArray(raw) ? raw : (raw as { countries?: unknown[] } | null)?.countries;
  if (!Array.isArray(list)) return [];
  const result: PsbCountry[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      result.push({ code: item, name: item.toUpperCase() });
      continue;
    }
    const c = (item || {}) as Record<string, unknown>;
    const code = String(c.code ?? c.country_code ?? c.value ?? '');
    if (!code) continue;
    result.push({ code, name: String(c.name ?? c.country_name ?? code) });
  }
  return result;
}

function normalizeHostnames(data: RawPoolData): PsbHostname[] {
  if (data.available_hostnames?.length) return data.available_hostnames;

  // Пул 2 отдаёт точки входа как entry_nodes
  const result: PsbHostname[] = [];
  for (const node of data.entry_nodes || []) {
    if (node.dns) result.push({ type: 'dns', name: node.dns, value: node.dns });
    for (const ip of node.ips || []) result.push({ type: 'ip', name: ip, value: ip });
  }
  return result;
}

function normalizeProtocols(data: RawPoolData, endpoint: PsbEndpoint): PsbOption[] {
  if (data.available_protocols?.length) return data.available_protocols;
  // У пула 2 протокол задаётся именем порта из entry_nodes
  const ports = data.entry_nodes?.[0]?.ports || [];
  const options = ports.map(p => ({ name: p.name.toUpperCase(), value: p.name }));
  if (options.length > 0) return options;
  return endpoint === 'pool-2'
    ? [
        { name: 'HTTP|HTTPS', value: 'http|https' },
        { name: 'SOCKS5', value: 'socks5' },
      ]
    : [
        { name: 'HTTP/HTTPS', value: 'http' },
        { name: 'SOCKS5', value: 'socks5' },
      ];
}

/**
 * Регионы/города/ASN. Пул 1 отдаёт массив `{code, name, count}`, пул 2 —
 * объект `{states: [...]}`; у пула 3 форма ответа в документации не описана
 * (известно только, что есть поле `prefix`). Принимаем любой из вариантов.
 */
function normalizeGeoList(raw: unknown, key: 'states' | 'cities' | 'asns'): PsbGeoItem[] {
  let list: unknown = raw;
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    list = obj[key] ?? obj.data ?? obj.items ?? [];
  }
  if (!Array.isArray(list)) return [];
  const result: PsbGeoItem[] = [];
  for (const item of list) {
    if (typeof item === 'string' || typeof item === 'number') {
      result.push({ code: String(item), name: String(item) });
      continue;
    }
    const g = (item || {}) as Record<string, unknown>;
    const code = String(g.code ?? g.value ?? g.id ?? g.asn ?? '');
    if (!code) continue;
    result.push({
      code,
      name: String(g.name ?? g.title ?? code),
      count: typeof g.count === 'number' ? g.count : undefined,
    });
  }
  return result;
}

/** Первое непустое строковое поле из списка возможных имён */
function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

/** Ищет учётные данные в ответе по подписке: в документации их состав не описан */
function extractStaticCredentials(raw: Record<string, unknown>): PsbStaticCredentials | null {
  const sources: Record<string, unknown>[] = [raw];
  for (const nested of ['credentials', 'auth', 'proxy', 'data', 'access', 'package']) {
    const value = raw[nested];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sources.push(value as Record<string, unknown>);
    }
  }
  const creds: PsbStaticCredentials = {};
  for (const src of sources) {
    creds.login ??= pickString(src, ['login', 'username', 'user', 'proxy_login', 'proxy_user']);
    creds.password ??= pickString(src, ['password', 'pass', 'proxy_password', 'proxy_pass']);
    creds.port ??= pickString(src, ['port', 'http_port', 'httpPort', 'proxy_port']);
    creds.socksPort ??= pickString(src, ['socks_port', 'socksPort', 'socks5_port']);
    creds.hostname ??= pickString(src, ['hostname', 'host', 'gateway']);
  }
  return creds.login || creds.password || creds.port ? creds : null;
}

function normalizeStaticSubscription(raw: Record<string, unknown>): PsbStaticSubscription {
  let ips: string[] = [];
  const proxyLines: string[] = [];
  let credentials = extractStaticCredentials(raw);

  const addresses = raw.ip_addresses;
  if (Array.isArray(addresses)) {
    ips = addresses.map(String).filter(Boolean);
  } else if (addresses && typeof addresses === 'object') {
    // Реальный формат PSB: {login, password, ips: ["ip:port", …]}
    const obj = addresses as Record<string, unknown>;
    ips = Array.isArray(obj.ips) ? obj.ips.map(String).filter(Boolean) : [];
    const login = pickString(obj, ['login', 'username']);
    const password = pickString(obj, ['password', 'pass']);
    if (login || password) credentials = { ...(credentials || {}), login, password };
    if (login && password) {
      for (const entry of ips) {
        const [host, port] = entry.split(':');
        if (host && port) proxyLines.push(`${host}:${port}:${login}:${password}`);
      }
    }
    if (!credentials?.port) {
      const firstPort = ips[0]?.split(':')[1];
      if (firstPort) credentials = { ...(credentials || {}), port: firstPort };
    }
  }

  // Готовые строки прокси в других полях, если PSB их отдаёт
  for (const key of ['proxies', 'proxy_list', 'proxy_lines', 'list']) {
    const value = raw[key];
    if (Array.isArray(value)) {
      for (const line of value) {
        if (typeof line === 'string' && parseProxyLine(line)) proxyLines.push(line);
      }
    }
  }

  return {
    id: Number(raw.id),
    title: String(raw.title || `#${raw.id}`),
    status: String(raw.status || 'active'),
    country: typeof raw.country === 'string' ? raw.country : null,
    categoryName: typeof raw.category_name === 'string' ? raw.category_name : null,
    purposeName: typeof raw.purpose_name === 'string' ? raw.purpose_name : null,
    ipAddresses: ips,
    ipCount: Number(raw.ip_count) || ips.length,
    autoRenewal: raw.auto_renewal === true,
    expiresAt: typeof raw.expires_at === 'string' ? raw.expires_at : null,
    renewableUntil: typeof raw.renewable_until === 'string' ? raw.renewable_until : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    stale: raw.stale === true,
    credentials,
    proxyLines,
    raw,
  };
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
    if (product.endpoint === 'pool-3') {
      // У пула 3 свои эндпоинты, параметра `type` у них нет
      if (subUserId != null) variants.push({ subUser_id: subUserId });
      variants.push({});
    } else {
      if (subUserId != null) variants.push({ subUser_id: subUserId, type: product.id });
      variants.push({ type: product.id });
      // В Postman-коллекции оба параметра выключены — значит запрос без них штатный
      if (product.id === 'residential-proxy-pool-1' || product.endpoint === 'pool-2') {
        variants.push({});
      }
    }

    let lastError: unknown;
    for (const query of variants) {
      try {
        const raw = await request<RawPoolData>('GET', this.base(product.endpoint), this.token, {
          query,
        });
        const data: PsbPoolData = {
          trafficAvailable: trafficGb(raw.traffic_available),
          countries: normalizeCountries(raw.available_countries),
          protocols: normalizeProtocols(raw, product.endpoint),
          rotations: raw.available_rotations || [],
          hostnames: normalizeHostnames(raw),
          formats: raw.available_formats || [],
        };
        if (product.endpoint === 'pool-3') await this.fillPool3Catalog(data);
        return data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Состав «Get Data» у пула 3 в документации не описан. Если каких-то
   * справочников в нём не оказалось, добираем их отдельными GET-эндпоинтами
   * `available_*` — они описаны точно.
   */
  private async fillPool3Catalog(data: PsbPoolData): Promise<void> {
    const base = this.base('pool-3');
    const fetchList = <T>(name: string): Promise<T[] | null> =>
      request<T[]>('GET', `${base}/${name}`, this.token).then(
        list => (Array.isArray(list) ? list : null),
        () => null,
      );

    const [countries, hostnames, formats, rotations, protocols] = await Promise.all([
      data.countries.length ? null : fetchList<unknown>('available_countries'),
      data.hostnames.length ? null : fetchList<PsbHostname>('available_hostnames'),
      data.formats.length ? null : fetchList<PsbOption>('available_formats'),
      data.rotations.length ? null : fetchList<PsbOption>('available_rotations'),
      data.protocols.length ? null : fetchList<PsbOption>('available_protocols'),
    ]);

    if (countries) data.countries = normalizeCountries(countries);
    if (hostnames) data.hostnames = hostnames;
    if (formats) data.formats = formats;
    if (rotations) data.rotations = rotations;
    if (protocols) data.protocols = protocols;
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

  /**
   * Регионы выбранных стран. Пул 1 принимает POST со списком стран,
   * пулы 2 и 3 — GET с одной страной в query.
   */
  async getStates(productId: PsbProductId, countries: string[]): Promise<PsbGeoItem[]> {
    const product = getProduct(productId);
    if (product.endpoint === 'pool-1') {
      const list = await request<unknown>('POST', `${this.base('pool-1')}/available_states`, this.token, {
        json: { type: product.id, countries },
      });
      return normalizeGeoList(list, 'states');
    }
    const data = await request<unknown>(
      'GET',
      `${this.base(product.endpoint)}/available_states`,
      this.token,
      { query: { country: countries[0] } },
    );
    return normalizeGeoList(data, 'states');
  }

  /** Города выбранных стран */
  async getCities(
    productId: PsbProductId,
    countries: string[],
    states: string[] = [],
  ): Promise<PsbGeoItem[]> {
    const product = getProduct(productId);
    if (product.endpoint === 'pool-1') {
      const list = await request<unknown>('POST', `${this.base('pool-1')}/available_cities`, this.token, {
        json: { type: product.id, countries, states },
      });
      return normalizeGeoList(list, 'cities');
    }
    const data = await request<unknown>(
      'GET',
      `${this.base(product.endpoint)}/available_cities`,
      this.token,
      { query: { country: countries[0] } },
    );
    return normalizeGeoList(data, 'cities');
  }

  /** ASN — у пулов 1 и 3; пул 2 их не поддерживает */
  async getAsns(
    productId: PsbProductId,
    countries: string[],
    states: string[] = [],
  ): Promise<PsbGeoItem[]> {
    const product = getProduct(productId);
    if (product.endpoint === 'pool-2') return [];
    if (product.endpoint === 'pool-1') {
      const list = await request<unknown>('POST', `${this.base('pool-1')}/available_asns`, this.token, {
        json: { type: product.id, countries, states },
      });
      return normalizeGeoList(list, 'asns');
    }
    const data = await request<unknown>(
      'GET',
      `${this.base('pool-3')}/available_asns`,
      this.token,
      { query: { country: countries[0] } },
    );
    return normalizeGeoList(data, 'asns');
  }

  /** Генерация списка прокси. Возвращает сырые строки провайдера. */
  async generateProxyList(params: GenerateParams): Promise<string[]> {
    const product = getProduct(params.product);

    let form: Record<string, string | number | undefined>;
    if (product.endpoint === 'pool-3') {
      // Пул 3: `lifetime` в минутах (3…1440), гео по одному значению,
      // регион и город вместе не принимаются — город точнее, его и оставляем
      const city = params.cities?.[0];
      const state = city ? undefined : params.states?.[0];
      const lifetime =
        params.rotation === 'sticky'
          ? Math.min(1440, Math.max(product.stickyMinMinutes ?? 3, params.sessionMinutes || 30))
          : undefined;
      form = {
        subUser_id: params.subUserId,
        hostname: params.hostname,
        format: 'hostname:port:login:password',
        protocol: params.protocol,
        rotation: params.rotation,
        proxy_count: params.count,
        location: params.countries?.[0],
        state,
        city,
        asn: params.asns?.[0],
        lifetime,
      };
    } else {
      form =
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
    }

    const list = await request<string[]>(
      'POST',
      `${this.base(product.endpoint)}/generate-proxy-list`,
      this.token,
      { form },
    );
    return Array.isArray(list) ? list : [];
  }

  /** Сброс sticky-сессии на конкретном порту. Параметр `type` есть только у пула 1 */
  async rotateIp(productId: PsbProductId, port: string): Promise<void> {
    const product = getProduct(productId);
    await request<unknown>('POST', `${this.base(product.endpoint)}/rotate-ip`, this.token, {
      form: product.endpoint === 'pool-1' ? { type: product.id, port } : { port },
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

    // После покупки PSB сам заводит базового суб-пользователя с купленным
    // трафиком — его достаточно для генерации (проверено на пуле 3: отдельный
    // суб-пользователь создаётся только отщипыванием трафика у базового).
    const basic = await this.getBasicSubUser(productType).catch(() => null);
    if (basic) return { subUser: basic, trafficMoved: true };

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

  /** Статичные пакеты каталога: цена за IP в месяц */
  async getStaticPackages(): Promise<PsbStaticPackage[]> {
    const raw = await request<RawShopProduct[]>('GET', '/api/products', this.token, {
      query: { type: 'static-proxy-package' },
    });
    return (raw || [])
      .filter(item => item.status !== false && item.type === 'static-proxy-package')
      .map(item => {
        const data = (item.data || {}) as RawStaticPackageData;
        return {
          id: item.id,
          title: item.title || `#${item.id}`,
          pricePerIp: Number(item.price) || 0,
          ipCount: Number(data.ip_count) || 1,
          categoryName: data.category_name || '',
        };
      });
  }

  // ─── Статичные прокси ────────────────────────────────────────────────

  /** Назначения и страны статичного пакета — нужны для покупки */
  async getStaticPackageDetails(productId: number): Promise<PsbStaticPackageDetails> {
    const raw = await request<{
      purposes?: unknown[];
      package?: { purposes?: unknown[] };
      usage_based?: boolean;
    }>('GET', `/api/static-proxy/packages/${productId}/details`, this.token);
    const list = raw?.purposes ?? raw?.package?.purposes ?? [];
    const purposes: PsbStaticPurpose[] = [];
    for (const item of Array.isArray(list) ? list : []) {
      const p = (item || {}) as Record<string, unknown>;
      const id = Number(p.id);
      if (!Number.isFinite(id)) continue;
      const countries: Record<string, number> = {};
      if (p.countries && typeof p.countries === 'object') {
        for (const [name, count] of Object.entries(p.countries as Record<string, unknown>)) {
          countries[name] = Number(count) || 0;
        }
      }
      purposes.push({ id, name: String(p.display_name ?? p.name ?? id), countries });
    }
    return { purposes, usageBased: raw?.usage_based === true };
  }

  /**
   * Покупка статичного пакета с баланса. Проверено живым API: ответ
   * `{message: "Order created successfully!"}`, подписка появляется сразу.
   * Флаг автопродления при покупке сервер проигнорировал (включил), поэтому
   * после покупки выставляем его отдельным запросом.
   */
  async buyStaticPackage(params: BuyStaticParams): Promise<PsbStaticSubscription | null> {
    const before = new Set((await this.listStaticSubscriptions().catch(() => [])).map(s => s.id));
    await request<unknown>('POST', `/api/products/${params.productId}/buy`, this.token, {
      json: {
        payment_type: 'balance',
        purpose_id: params.purposeId,
        country: params.country,
        package_count: params.count,
        auto_renewal: params.autoRenewal,
      },
    });

    const after = await this.listStaticSubscriptions().catch(() => []);
    const created = after.filter(s => !before.has(s.id)).sort((a, b) => b.id - a.id)[0] || null;
    if (created && created.autoRenewal !== params.autoRenewal) {
      try {
        return await this.setStaticAutoRenewal(created.id, params.autoRenewal);
      } catch (err) {
        console.warn('[PSB] не удалось выставить автопродление после покупки:', err);
      }
    }
    return created;
  }

  /** Все подписки на статичные прокси аккаунта */
  async listStaticSubscriptions(): Promise<PsbStaticSubscription[]> {
    const raw = await request<unknown>('GET', '/api/static-proxy/subscriptions', this.token);
    const list = Array.isArray(raw)
      ? raw
      : ((raw as { data?: unknown[] } | null)?.data ?? []);
    return (Array.isArray(list) ? list : [])
      .filter(item => item && typeof item === 'object')
      .map(item => normalizeStaticSubscription(item as Record<string, unknown>));
  }

  /** Одна подписка с актуальным живым статусом */
  async getStaticSubscription(id: number): Promise<PsbStaticSubscription> {
    const raw = await request<Record<string, unknown>>(
      'GET',
      `/api/static-proxy/subscriptions/${id}`,
      this.token,
    );
    return normalizeStaticSubscription(raw || {});
  }

  /** Заменяет все IP подписки на новые */
  async swapStaticIps(id: number): Promise<PsbStaticSubscription> {
    const raw = await request<Record<string, unknown>>(
      'POST',
      `/api/static-proxy/subscriptions/${id}/swap`,
      this.token,
    );
    return normalizeStaticSubscription(raw || {});
  }

  async setStaticAutoRenewal(id: number, enabled: boolean): Promise<PsbStaticSubscription> {
    const raw = await request<Record<string, unknown>>(
      'PUT',
      `/api/static-proxy/subscriptions/${id}/auto-renewal`,
      this.token,
      { form: { auto_renewal: enabled ? 'true' : 'false' } },
    );
    return normalizeStaticSubscription(raw || {});
  }

  /** Продлевает подписку на месяц с баланса аккаунта */
  async renewStatic(id: number): Promise<PsbStaticSubscription> {
    const raw = await request<Record<string, unknown>>(
      'POST',
      `/api/static-proxy/subscriptions/${id}/renew`,
      this.token,
    );
    return normalizeStaticSubscription(raw || {});
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
    const form: Record<string, string | number | undefined> = { type: product.id };
    if (product.endpoint === 'pool-2' && amountGb) form.available_traffic = amountGb;
    // Пул 3 требует целое `traffic_available` — столько ГБ уйдёт с базового суб-пользователя
    if (product.endpoint === 'pool-3') form.traffic_available = Math.max(1, Math.floor(amountGb || 1));
    return request<PsbSubUser>('POST', '/api/subUsers', this.token, { form });
  }

  /**
   * Базовый суб-пользователь продукта. В `GET /subUsers` он не попадает,
   * появляется после первой покупки; отвечает 404, если покупки не было.
   */
  async getBasicSubUser(productId: PsbProductId): Promise<PsbSubUser> {
    return request<PsbSubUser>('GET', '/api/subUsers/basic', this.token, {
      query: { type: getProduct(productId).id },
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
