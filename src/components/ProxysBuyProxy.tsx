import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, Check, Loader2, ShieldCheck, Server, Home, Gem, Monitor, Gift, Globe2, AlertTriangle } from 'lucide-react';
import {
  ProxysClient,
  getServiceKind,
  getMinPrice,
  normalizeCurrency,
  type ProxysService,
  type ProxysCountry,
  type ProxysPrice,
  type ProxysBuyResult,
} from '@/lib/proxys-api';
import { useTranslation } from '@/lib/i18n';

type StepId = 'service' | 'country' | 'params';

const KIND_ICONS = {
  ipv4: Server,
  ipv6: Globe2,
  shared: Home,
  premium: Gem,
  windows: Monitor,
  mystery: Gift,
} as const;

/** Коды, для которых нет флага в flag-icons (нестандартные обозначения Proxys.io) */
const NO_FLAG = new Set(['RR', 'ZZ']);

function CountryFlag({ code, className = '' }: { code: string; className?: string }) {
  if (NO_FLAG.has(code.toUpperCase())) {
    return <Globe2 className={`w-4 h-4 text-[#75C948] ${className}`} />;
  }
  return <span className={`fi fi-${code.toLowerCase()} ${className}`} />;
}

export function ProxysBuyProxy({
  client,
  onPurchased,
}: {
  client: ProxysClient;
  onPurchased: (
    order: ProxysBuyResult,
    meta: { country: string; countryName: string; serviceId: number; serviceName: string },
  ) => void;
}) {
  const { t } = useTranslation();

  const [services, setServices] = useState<ProxysService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const [service, setService] = useState<ProxysService | null>(null);
  const [country, setCountry] = useState<ProxysCountry | null>(null);
  const [count, setCount] = useState(1);
  const [period, setPeriod] = useState(30);

  const [step, setStep] = useState<StepId>('service');
  const [countrySearch, setCountrySearch] = useState('');

  const [price, setPrice] = useState<ProxysPrice | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [availability, setAvailability] = useState<'unknown' | 'checking' | 'ok' | 'low'>('unknown');
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Каталог грузим один раз — ключ для него не нужен
  useEffect(() => {
    let cancelled = false;
    setLoadingServices(true);
    client
      .getServices()
      .then(data => {
        if (!cancelled) setServices(data);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || t('proxys.servicesLoadError'));
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleServiceSelect = useCallback((next: ProxysService) => {
    setService(next);
    setCountry(null);
    setPrice(null);
    setAvailability('unknown');
    setError(null);

    const periods = next.periods.map(Number).filter(Boolean);
    setPeriod(periods.includes(30) ? 30 : periods[0] || 30);

    // Минимальный заказ определяется тарифом (у IPv6, например, это 10 шт.)
    const minCount = next.tariffs?.length ? Math.min(...next.tariffs.map(tariff => tariff.count_min)) : 1;
    setCount(minCount || 1);

    // Если страна одна — пропускаем шаг выбора
    if (next.available_countries.length === 1) {
      setCountry(next.available_countries[0]);
      setStep('params');
    } else {
      setStep('country');
    }
  }, []);

  const handleCountrySelect = useCallback((next: ProxysCountry) => {
    setCountry(next);
    setAvailability('unknown');
    setStep('params');
  }, []);

  // Цена пересчитывается автоматически при изменении параметров
  const priceRequestId = useRef(0);
  useEffect(() => {
    if (!service || !country) return;
    const requestId = ++priceRequestId.current;
    setLoadingPrice(true);

    const timer = setTimeout(() => {
      client
        .getPrice({ service: service.service_id, count, country: country.country_code, period })
        .then(result => {
          if (priceRequestId.current === requestId) setPrice(result);
        })
        .catch(() => {
          if (priceRequestId.current === requestId) setPrice(null);
        })
        .finally(() => {
          if (priceRequestId.current === requestId) setLoadingPrice(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [client, service, country, count, period]);

  const handleCheckAvailability = async () => {
    if (!service || !country) return;
    setAvailability('checking');
    const available = await client.checkAvailability({
      service: service.service_id,
      count,
      country: country.country_code,
    });
    setAvailability(available ? 'ok' : 'low');
  };

  const handleBuy = async () => {
    if (!service || !country) return;
    setBuying(true);
    setError(null);
    try {
      const result = await client.buyProxy({
        service: service.service_id,
        count,
        country: country.country_code,
        period,
      });
      onPurchased(result, {
        country: country.country_code,
        countryName: country.country_name,
        serviceId: service.service_id,
        serviceName: service.service_name,
      });
    } catch (err: any) {
      setError(err?.message || t('proxys.buyError'));
    } finally {
      setBuying(false);
    }
  };

  const filteredCountries = useMemo(() => {
    if (!service) return [];
    const query = countrySearch.trim().toLowerCase();
    if (!query) return service.available_countries;
    return service.available_countries.filter(
      item =>
        item.country_name.toLowerCase().includes(query) ||
        item.country_code.toLowerCase().includes(query),
    );
  }, [service, countrySearch]);

  /** Тариф, под который попадает текущее количество */
  const activeTariff = useMemo(() => {
    if (!service?.tariffs?.length) return null;
    return (
      service.tariffs.find(tariff => count >= tariff.count_min && count <= tariff.count_max) ||
      service.tariffs[service.tariffs.length - 1]
    );
  }, [service, count]);

  const countLimits = useMemo(() => {
    if (!service?.tariffs?.length) return { min: 1, max: 200 };
    return {
      min: Math.min(...service.tariffs.map(tariff => tariff.count_min)),
      max: Math.max(...service.tariffs.map(tariff => tariff.count_max)),
    };
  }, [service]);

  const steps: { id: StepId; label: string; done: boolean; enabled: boolean }[] = [
    { id: 'service', label: t('proxys.stepService'), done: !!service, enabled: true },
    { id: 'country', label: t('proxys.stepCountry'), done: !!country, enabled: !!service },
    { id: 'params', label: t('proxys.stepParams'), done: false, enabled: !!service && !!country },
  ];

  return (
    <div className="space-y-5">
      {/* Шаги */}
      <div className="flex gap-1 border-b">
        {steps.map(item => (
          <button
            key={item.id}
            onClick={() => item.enabled && setStep(item.id)}
            disabled={!item.enabled}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              step === item.id
                ? 'border-[#75C948] text-[#4e9a26] dark:text-[#75C948]'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {item.done && <Check className="w-4 h-4 text-[#75C948]" />}
            {item.label}
          </button>
        ))}
      </div>

      {/* Шаг 1 — тип прокси */}
      {step === 'service' && (
        <div className="space-y-3">
          {loadingServices ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#75C948]" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {services.map(item => {
                const Icon = KIND_ICONS[getServiceKind(item)];
                const minPrice = getMinPrice(item);
                const selected = service?.service_id === item.service_id;
                return (
                  <button
                    key={item.service_id}
                    onClick={() => handleServiceSelect(item)}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-sm ${
                      selected
                        ? 'border-[#75C948] bg-[#75C948]/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-[#75C948]/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#75C948]/15 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-[18px] h-[18px] text-[#4e9a26] dark:text-[#75C948]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm leading-tight">{item.service_name}</div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
                          <span>
                            {t('proxys.countriesCount', { count: String(item.available_countries.length) })}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span>{item.periods.join('/')} {t('proxys.daysShort')}</span>
                        </div>
                        {minPrice && (
                          <div className="mt-2 text-sm">
                            <span className="text-gray-500 text-xs">{t('proxys.priceFrom')} </span>
                            <span className="font-bold text-[#4e9a26] dark:text-[#75C948]">
                              {minPrice.price.toFixed(2)} {minPrice.currency}
                            </span>
                            <span className="text-gray-500 text-xs"> {t('proxys.perProxy')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Шаг 2 — страна */}
      {step === 'country' && service && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
              placeholder={t('proxys.searchCountry')}
              className="pl-10"
            />
          </div>

          {filteredCountries.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-500">{t('proxys.noCountriesFound')}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredCountries.map(item => (
                <button
                  key={item.country_code}
                  onClick={() => handleCountrySelect(item)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors ${
                    country?.country_code === item.country_code
                      ? 'border-[#75C948] bg-[#75C948]/10'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <CountryFlag code={item.country_code} />
                  <span className="flex-1 truncate">{item.country_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Шаг 3 — параметры и покупка */}
      {step === 'params' && service && country && (
        <div className="space-y-5">
          {/* Сводка */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60">
            <CountryFlag code={country.country_code} className="text-xl" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{service.service_name}</div>
              <div className="text-xs text-gray-500">{country.country_name}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep('service')}>
              {t('proxys.change')}
            </Button>
          </div>

          {/* Количество */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('proxys.quantity')}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {t('proxys.quantityRange', { min: String(countLimits.min), max: String(countLimits.max) })}
              </span>
            </label>
            <Input
              type="number"
              min={countLimits.min}
              max={countLimits.max}
              value={count}
              onChange={e => {
                setCount(Math.max(1, parseInt(e.target.value) || 1));
                setAvailability('unknown');
              }}
            />
            {activeTariff && (
              <div className="text-xs text-gray-500">
                {t('proxys.tariffHint', {
                  name: activeTariff.name,
                  price: activeTariff.price.toFixed(2),
                  currency: activeTariff.currency,
                })}
              </div>
            )}
          </div>

          {/* Период */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('proxys.period')}</label>
            <div className="flex gap-2">
              {service.periods.map(Number).filter(Boolean).map(days => (
                <button
                  key={days}
                  onClick={() => setPeriod(days)}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                    period === days
                      ? 'border-[#75C948] bg-[#75C948]/10 text-[#4e9a26] dark:text-[#75C948]'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {t('proxys.periodDays', { days: String(days) })}
                </button>
              ))}
            </div>
          </div>

          {/* Итог */}
          <div className="p-4 rounded-xl bg-[#75C948]/10 border border-[#75C948]/30">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{t('proxys.total')}</div>
                <div className="text-2xl font-bold text-[#3d7a1e] dark:text-[#75C948]">
                  {loadingPrice ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : price ? (
                    `${price.price.toFixed(2)} ${price.currency}`
                  ) : (
                    '—'
                  )}
                </div>
                {/* Каталог показывает цены в USD, а списание идёт в валюте аккаунта — показываем обе */}
                {price?.tariffPlanPrice != null && normalizeCurrency(price.tariffPlanCurrency) !== price.currency && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    ≈ {price.tariffPlanPrice.toFixed(2)} {normalizeCurrency(price.tariffPlanCurrency)}
                    {price.tariffPlanPriceForOneProxy != null && (
                      <> · {price.tariffPlanPriceForOneProxy.toFixed(2)} {t('proxys.perProxy')}</>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckAvailability}
                disabled={availability === 'checking'}
                className="border-[#75C948]/50"
              >
                {availability === 'checking' ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                )}
                {t('proxys.checkStock')}
              </Button>
            </div>

            {availability === 'ok' && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-[#4e9a26] dark:text-[#75C948]">
                <Check className="w-4 h-4" />
                {t('proxys.stockOk', { count: String(count) })}
              </div>
            )}
            {availability === 'low' && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-amber-600">
                <AlertTriangle className="w-4 h-4" />
                {t('proxys.stockLow')}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleBuy}
            disabled={buying || !price}
            className="w-full bg-[#75C948] hover:bg-[#64b23c] text-white font-semibold h-11"
          >
            {buying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('proxys.buying')}
              </>
            ) : (
              t('proxys.buyButton', { count: String(count) })
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ProxysBuyProxy;
