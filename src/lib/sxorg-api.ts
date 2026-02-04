// SX.ORG API Client
const API_BASE = 'https://api.sx.org/v2';

export interface SXOrgBalance {
  success: boolean;
  balance: string;
  balance_traffic: string;
  all_available_traffic: string;
  prepared_traffic_balance: string;
  balance_hold: string;
}

export interface SXOrgCountry {
  id: number;
  code: string;
  name: string;
  flag?: string;
}

export interface SXOrgState {
  id: number;
  name: string;
  dir_country_id: number;
}

export interface SXOrgCity {
  id: number;
  name: string;
  dir_country_id: number;
  dir_state_id: number;
}

export interface SXOrgASN {
  asn: number;
  name: string;
}

export interface CreateProxyRequest {
  country_code: string;
  state_id?: number; // ID штата
  city_id?: number;  // ID города
  asn?: number;
  type_id?: number; // Тип сессии: 1=KEEP PROXY, 2=KEEP_CONNECTION, 3=ROTATE CONNECTION
  proxy_type_id?: number; // Тип прокси: 1=RESIDENTIAL, 2=ALL, 3=MOBILE, 4=CORPORATE
  name?: string;
  server_port_type_id?: number; // Тип порта: 0=SHARED, 1=DEDICATED
  count?: number;
  ttl?: number; // Время жизни в минутах (для ROTATE)
  traffic_limit?: number; // Лимит трафика в GB (только для DEDICATED)
}

export interface SXOrgProxyPort {
  id: number;
  name: string;
  proxy?: string; // "89.39.104.79:19266" из нового API
  server?: string; // старый формат
  port: number;
  login: string;
  password: string;
  countryCode?: string; // новый формат
  country_code?: string; // старый формат
  country?: string;
  stateName?: string; // новый формат
  state?: string;
  cityName?: string; // новый формат
  city?: string;
  type_id?: number;
  proxy_type_id: number;
  status: string | number; // может быть строка или число (1=active)
  created_at: string;
  expires_at?: string;
  refresh_link?: string;
  template?: string; // полная строка прокси из нового API
}

export interface SXOrgProxyList {
  success: boolean;
  data?: SXOrgProxyPort[]; // Старый формат (deprecated)
  message?: { // Новый формат
    countProxies: number;
    pagination: {
      page: number;
      pageCount: number;
      pageSize: number;
      totalCount: number;
    };
    proxies: SXOrgProxyPort[];
  };
}

export class SXOrgClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${API_BASE}${endpoint}${separator}apiKey=${this.apiKey}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  // Получить баланс
  async getBalance(): Promise<SXOrgBalance> {
    return this.request<SXOrgBalance>('/user/balance');
  }

  // Получить список стран
  async getCountries(): Promise<SXOrgCountry[]> {
    const response = await this.request<{ success: boolean; countries: SXOrgCountry[] }>('/dir/countries');
    return response.countries || [];
  }

  // Получить список штатов
  async getStates(countryId: number): Promise<SXOrgState[]> {
    const response = await this.request<{ success: boolean; states: SXOrgState[] }>(`/dir/states?countryId=${countryId}`);
    return response.states || [];
  }

  // Получить список городов
  async getCities(countryId: number, stateId?: number): Promise<SXOrgCity[]> {
    const stateParam = stateId ? `&stateId=${stateId}` : '';
    const response = await this.request<{ success: boolean; cities: SXOrgCity[] }>(`/dir/cities?countryId=${countryId}${stateParam}`);
    return response.cities || [];
  }

  // Получить список ASN
  async getASNs(countryCode: string): Promise<SXOrgASN[]> {
    const response = await this.request<{ success: boolean; asns: SXOrgASN[] }>(`/dir/asn?country_code=${countryCode}`);
    return response.asns || [];
  }

  // Создать прокси
  async createProxy(params: CreateProxyRequest): Promise<SXOrgProxyList> {
    return this.request<SXOrgProxyList>('/proxy/create-port', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Получить список прокси
  async getProxies(): Promise<SXOrgProxyList> {
    const response = await this.request<SXOrgProxyList>('/proxy/ports');

    // API возвращает данные в message.proxies, но мы нормализуем в data
    if (response.message?.proxies) {
      return {
        success: response.success,
        data: response.message.proxies,
      };
    }

    return response;
  }

  // Обновить IP прокси (использовать refresh_link)
  async refreshProxyIP(refreshLink: string): Promise<{ success: boolean }> {
    // refresh_link уже содержит полный URL с apiKey
    const response = await fetch(refreshLink);
    return response.json();
  }

  // Удалить прокси
  async deleteProxy(proxyId: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/proxy/port/${proxyId}`, {
      method: 'DELETE',
    });
  }
}

// Сохранить API ключ
export function saveSXOrgApiKey(apiKey: string): void {
  localStorage.setItem('sxorg_api_key', apiKey);
}

// Получить сохраненный API ключ
export function getSXOrgApiKey(): string | null {
  return localStorage.getItem('sxorg_api_key');
}

// Удалить API ключ
export function removeSXOrgApiKey(): void {
  localStorage.removeItem('sxorg_api_key');
}

// Создать клиент с сохраненным ключом
export function createSXOrgClient(): SXOrgClient | null {
  const apiKey = getSXOrgApiKey();
  return apiKey ? new SXOrgClient(apiKey) : null;
}
