import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, Search, RefreshCw, Download, CheckSquare, CalendarPlus, Clock, Globe2 } from 'lucide-react';
import {
  ProxysClient,
  daysLeft,
  formatExpiry,
  getSocksPort,
  getHttpPort,
  type ProxysOrder,
  type ProxysIpItem,
} from '@/lib/proxys-api';
import type { Proxy } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

/** Метаданные заказов, сохранённые при покупке (API их в /ip не возвращает) */
export interface OrderMeta {
  country?: string;
  countryName?: string;
  serviceName?: string;
}

type Protocol = 'http' | 'socks5';

const NO_FLAG = new Set(['RR', 'ZZ']);

function CountryFlag({ code }: { code?: string }) {
  if (!code) return <Globe2 className="w-4 h-4 text-gray-400" />;
  if (NO_FLAG.has(code.toUpperCase())) return <Globe2 className="w-4 h-4 text-[#75C948]" />;
  return <span className={`fi fi-${code.toLowerCase()} text-lg`} />;
}

/** Уникальный ключ IP внутри заказа */
const ipKey = (orderId: number, ip: string) => `${orderId}:${ip}`;

export function ProxysMyProxies({
  client,
  orderMeta,
  onProxiesImported,
  reloadToken,
}: {
  client: ProxysClient;
  orderMeta: Record<number, OrderMeta>;
  onProxiesImported: (proxies: Proxy[]) => void;
  /** Меняется после покупки, чтобы перезагрузить список */
  reloadToken?: number;
}) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<ProxysOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [protocol, setProtocol] = useState<Protocol>('socks5');
  const [extendingOrder, setExtendingOrder] = useState<number | null>(null);
  /** code → название страны из каталога: у старых заказов в meta лежит только код */
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    client
      .getServices()
      .then(services => {
        if (cancelled) return;
        const names: Record<string, string> = {};
        for (const service of services) {
          for (const country of service.available_countries) {
            names[country.country_code.toUpperCase()] = country.country_name;
          }
        }
        setCountryNames(names);
      })
      .catch(() => {
        /* названия — украшение, без них покажем код страны */
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  /**
   * Данные заказа для отображения. Приоритет у country_code из самого ответа
   * API — он есть даже у заказов, купленных не через AEZAKMI; сохранённые при
   * покупке метаданные лишь дополняют его названием тарифа.
   */
  const metaFor = useCallback(
    (order: ProxysOrder): OrderMeta => {
      const saved = orderMeta[order.order_id] || {};
      const code = (order.country_code || saved.country || '').toUpperCase();
      return {
        country: code,
        countryName: countryNames[code] || saved.countryName,
        serviceName: saved.serviceName,
      };
    },
    [orderMeta, countryNames],
  );

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await client.getOrders();
      setOrders(data);
    } catch (err: any) {
      const message = err?.message || t('proxys.ordersLoadError');
      setError(message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, reloadToken]);

  /** Плоский список всех IP с привязкой к заказу — по нему идут поиск и выбор */
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all = orders.flatMap(order =>
      order.list_ip.map(ip => ({ order, ip })),
    );
    if (!query) return all;
    return all.filter(({ order, ip }) => {
      const m = metaFor(order);
      const country = `${m.country || ''} ${m.countryName || ''}`;
      return (
        ip.ip.includes(query) ||
        order.username.toLowerCase().includes(query) ||
        String(order.order_id).includes(query) ||
        country.toLowerCase().includes(query)
      );
    });
  }, [orders, search, metaFor]);

  /** Строки, сгруппированные обратно по заказам — так их и рисуем */
  const groups = useMemo(() => {
    const map = new Map<number, { order: ProxysOrder; ips: ProxysIpItem[] }>();
    for (const { order, ip } of rows) {
      if (!map.has(order.order_id)) map.set(order.order_id, { order, ips: [] });
      map.get(order.order_id)!.ips.push(ip);
    }
    return [...map.values()];
  }, [rows]);

  const portFor = (ip: ProxysIpItem) => (protocol === 'socks5' ? getSocksPort(ip) : getHttpPort(ip));

  const toggleIp = (orderId: number, ip: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      const key = ipKey(orderId, ip);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleOrder = (order: ProxysOrder, ips: ProxysIpItem[]) => {
    const keys = ips.map(ip => ipKey(order.order_id, ip.ip));
    const allSelected = keys.every(key => selected.has(key));
    setSelected(prev => {
      const next = new Set(prev);
      keys.forEach(key => (allSelected ? next.delete(key) : next.add(key)));
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(({ order, ip }) => ipKey(order.order_id, ip.ip))));
    }
  };

  const handleImport = () => {
    const picked = rows.filter(({ order, ip }) => selected.has(ipKey(order.order_id, ip.ip)));
    if (picked.length === 0) {
      toast.error(t('proxys.selectAtLeastOne'));
      return;
    }

    // Без порта прокси нерабочий — лучше сказать об этом, чем молча импортировать
    const brokenIp = picked.find(({ ip }) => !portFor(ip));
    if (brokenIp) {
      toast.error(t('proxys.noPortForProtocol', { ip: brokenIp.ip.ip, protocol: protocol.toUpperCase() }));
      return;
    }

    const converted: Proxy[] = picked.map(({ order, ip }) => {
      const meta = metaFor(order);
      const country = meta.country || '';
      const port = portFor(ip);

      // Имя должно читаться с одного взгляда: страна, версия IP и адрес.
      // Протокол не пишем — он и так виден по бейджу и меняется при импорте.
      const place = meta.countryName || (country ? country.toUpperCase() : `Заказ #${order.order_id}`);
      const name = `${place} · IPv${order.ip_version} · ${ip.ip}:${port}`;

      return {
        id: `proxys-${order.order_id}-${ip.ip}-${port}`,
        name,
        enabled: true,
        type: protocol,
        host: ip.ip,
        port,
        username: order.username,
        password: order.password,
        status: 'unchecked' as const,
        metadata: {
          proxys_order_id: order.order_id,
          country: meta.countryName || country,
          countryCode: country.toLowerCase(),
          service: meta.serviceName,
          ip_version: order.ip_version,
          expires_at: order.expires_at,
        },
      };
    });

    onProxiesImported(converted);
    toast.success(t('proxys.importedCount', { count: String(converted.length) }));
    setSelected(new Set());
  };

  const handleExtend = async (orderId: number) => {
    setExtendingOrder(orderId);
    try {
      await client.extendOrder(orderId);
      toast.success(t('proxys.extendSuccess', { id: String(orderId) }));
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.message || t('proxys.extendError'));
    } finally {
      setExtendingOrder(null);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-[#75C948]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Поиск + протокол */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('proxys.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden">
          {(['socks5', 'http'] as Protocol[]).map(item => (
            <button
              key={item}
              onClick={() => setProtocol(item)}
              className={`px-3 text-sm font-medium transition-colors ${
                protocol === item
                  ? 'bg-[#75C948] text-white'
                  : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
        <Button variant="outline" size="icon" onClick={loadOrders} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Действия */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={toggleAll} disabled={rows.length === 0}>
          <CheckSquare className="w-4 h-4 mr-2" />
          {selected.size === rows.length && rows.length > 0 ? t('proxys.deselectAll') : t('proxys.selectAll')}
        </Button>
        <Button
          size="sm"
          onClick={handleImport}
          disabled={selected.size === 0}
          className="bg-[#75C948] hover:bg-[#64b23c] text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          {t('proxys.importButton', { count: String(selected.size) })}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Заказы */}
      {groups.length === 0 ? (
        <div className="border rounded-xl p-10 text-center text-sm text-gray-500">
          {search ? t('proxys.noProxiesFound') : t('proxys.noProxiesYet')}
        </div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {groups.map(({ order, ips }) => {
            const meta = metaFor(order);
            const left = daysLeft(order.expires_at);
            const keys = ips.map(ip => ipKey(order.order_id, ip.ip));
            const allSelected = keys.length > 0 && keys.every(key => selected.has(key));

            return (
              <div key={order.order_id} className="border rounded-xl overflow-hidden">
                {/* Шапка заказа */}
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60">
                  <button
                    onClick={() => toggleOrder(order, ips)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      allSelected ? 'bg-[#75C948] border-[#75C948]' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {allSelected && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                  </button>

                  <CountryFlag code={meta.country} />

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {meta.serviceName || t('proxys.orderTitle', { id: String(order.order_id) })}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>IPv{order.ip_version}</span>
                      <span className="text-gray-300">•</span>
                      <span>{t('proxys.ipCount', { count: String(order.list_ip.length) })}</span>
                      <span className="text-gray-300">•</span>
                      <span>{order.username}</span>
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${
                      left <= 3
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : left <= 7
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                    title={formatExpiry(order.expires_at)}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {t('proxys.daysLeft', { days: String(Math.max(0, left)) })}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExtend(order.order_id)}
                    disabled={extendingOrder === order.order_id}
                    title={t('proxys.extendHint')}
                  >
                    {extendingOrder === order.order_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CalendarPlus className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* IP-адреса */}
                <div className="divide-y">
                  {ips.map(ip => {
                    const key = ipKey(order.order_id, ip.ip);
                    const isSelected = selected.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleIp(order.order_id, ip.ip)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isSelected ? 'bg-[#75C948]/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border-2 flex-shrink-0 ${
                            isSelected ? 'bg-[#75C948] border-[#75C948]' : 'border-gray-300 dark:border-gray-600'
                          }`}
                        />
                        <span className="font-mono text-sm flex-1 truncate">
                          {ip.ip}:{portFor(ip)}
                        </span>
                        <span className="text-xs text-gray-400 uppercase">{protocol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs text-gray-500">
        {t('proxys.foundProxies', { filtered: String(rows.length), total: String(orders.reduce((sum, order) => sum + order.list_ip.length, 0)) })}
      </div>
    </div>
  );
}

export default ProxysMyProxies;
