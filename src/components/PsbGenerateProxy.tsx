import { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, Check, Loader2, Globe2, AlertTriangle, Zap, Download, RefreshCw } from 'lucide-react';
import {
  PsbClient,
  parseProxyLine,
  getProduct,
  type PsbProduct,
  type PsbProductId,
  type PsbPoolData,
  type PsbCountry,
  type PsbGeoItem,
  type PsbOption,
} from '@/lib/psb-api';
import { PSB_TEAL } from './PsbLogo';
import type { Proxy } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

type StepId = 'geo' | 'params' | 'result';

function CountryFlag({ code, className = '' }: { code?: string; className?: string }) {
  if (!code) return <Globe2 className={`w-4 h-4 text-gray-400 ${className}`} />;
  return <span className={`fi fi-${code.toLowerCase()} ${className}`} />;
}

export function PsbGenerateProxy({
  client,
  available,
  activeProduct,
  poolData,
  onProductChange,
  onProxiesGenerated,
}: {
  client: PsbClient;
  available: { product: PsbProduct; data: PsbPoolData }[];
  activeProduct: PsbProductId;
  poolData: PsbPoolData;
  onProductChange: (product: PsbProductId) => void;
  onProxiesGenerated: (proxies: Proxy[]) => void;
}) {
  const { t } = useTranslation();

  const [step, setStep] = useState<StepId>('geo');

  // Гео
  const [country, setCountry] = useState<PsbCountry | null>(null);
  const [states, setStates] = useState<PsbGeoItem[]>([]);
  const [cities, setCities] = useState<PsbGeoItem[]>([]);
  const [asns, setAsns] = useState<PsbGeoItem[]>([]);
  const [state, setState] = useState<PsbGeoItem | null>(null);
  const [city, setCity] = useState<PsbGeoItem | null>(null);
  const [asn, setAsn] = useState<PsbGeoItem | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(false);

  // Параметры
  const [protocol, setProtocol] = useState('');
  const [rotation, setRotation] = useState('');
  const [hostname, setHostname] = useState('');
  const [count, setCount] = useState(10);
  const [sessionMinutes, setSessionMinutes] = useState(30);

  const [countrySearch, setCountrySearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Справочники приходят готовыми из «Get Data» — при смене продукта сбрасываем выбор
  useEffect(() => {
    setCountry(null);
    setState(null);
    setCity(null);
    setAsn(null);
    setStates([]);
    setCities([]);
    setAsns([]);
    setLines([]);
    setError(null);
    setStep('geo');

    setProtocol(poolData.protocols[0]?.value || 'http');
    setRotation(poolData.rotations[0]?.value || 'rotating');
    setHostname(poolData.hostnames[0]?.value || '');
  }, [activeProduct, poolData]);

  const handleCountrySelect = useCallback(
    async (next: PsbCountry | null) => {
      setCountry(next);
      setState(null);
      setCity(null);
      setAsn(null);
      setStates([]);
      setCities([]);
      setAsns([]);

      if (!next) {
        setStep('params');
        return;
      }

      setLoadingGeo(true);
      try {
        const [stateList, cityList, asnList] = await Promise.all([
          client.getStates(activeProduct, [next.code]).catch(() => []),
          client.getCities(activeProduct, [next.code]).catch(() => []),
          client.getAsns(activeProduct, [next.code]).catch(() => []),
        ]);
        setStates(stateList);
        setCities(cityList);
        setAsns(asnList);
      } finally {
        setLoadingGeo(false);
      }
    },
    [client, activeProduct],
  );

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await client.generateProxyList({
        product: activeProduct,
        hostname,
        protocol,
        rotation,
        count,
        countries: country ? [country.code] : undefined,
        states: state ? [state.code] : undefined,
        cities: city ? [city.code] : undefined,
        asns: asn ? [asn.code] : undefined,
        sessionMinutes,
      });

      if (result.length === 0) {
        setError(t('psb.emptyResult'));
        return;
      }
      setLines(result);
      setStep('result');
    } catch (err: any) {
      setError(err?.message || t('psb.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const handleImport = () => {
    const proxyType = protocol.includes('socks') ? 'socks5' : 'http';
    const place = country?.name || t('psb.anyCountry');
    const rotationName = poolData.rotations.find(r => r.value === rotation)?.name || rotation;
    const productLabel = t(getProduct(activeProduct).labelKey);

    const converted: Proxy[] = [];
    for (const line of lines) {
      const parsed = parseProxyLine(line);
      if (!parsed) continue;

      converted.push({
        // Логин у PSB кодирует сессию, поэтому он часть идентичности прокси
        id: `psb-${activeProduct}-${parsed.host}-${parsed.port}-${parsed.username}`,
        name: `PSB · ${place} · ${rotationName} · ${parsed.host}:${parsed.port}`,
        enabled: true,
        type: proxyType,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        status: 'unchecked' as const,
        metadata: {
          psb_product: activeProduct,
          service: productLabel,
          country: country?.name,
          countryCode: country?.code?.toLowerCase(),
          state: state?.name,
          city: city?.name,
          rotation,
        },
      });
    }

    if (converted.length === 0) {
      toast.error(t('psb.parseError'));
      return;
    }

    onProxiesGenerated(converted);
  };

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    if (!query) return poolData.countries;
    return poolData.countries.filter(
      item => item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query),
    );
  }, [poolData.countries, countrySearch]);

  const isSticky = rotation === 'sticky';
  /** Гео точнее страны у PSB тарифицируется вдвое дороже */
  const doubleBilled = !!(state || city);

  const steps: { id: StepId; label: string; done: boolean; enabled: boolean }[] = [
    { id: 'geo', label: t('psb.stepGeo'), done: !!country, enabled: true },
    { id: 'params', label: t('psb.stepParams'), done: lines.length > 0, enabled: true },
    { id: 'result', label: t('psb.stepResult'), done: false, enabled: lines.length > 0 },
  ];

  return (
    <div className="space-y-5">
      {/* Продукт — показываем только доступные аккаунту */}
      {available.length > 1 && (
        <div className="flex gap-2">
          {available.map(({ product, data }) => (
            <button
              key={product.id}
              onClick={() => onProductChange(product.id)}
              className={`flex-1 py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                activeProduct === product.id
                  ? 'border-[#5AA4AD] bg-[#5AA4AD]/10 text-[#3d7a82]'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div>{t(product.labelKey)}</div>
              <div className="text-[11px] font-normal text-gray-500">
                {data.trafficAvailable.toFixed(2)} GB
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Шаги */}
      <div className="flex gap-1 border-b">
        {steps.map(item => (
          <button
            key={item.id}
            onClick={() => item.enabled && setStep(item.id)}
            disabled={!item.enabled}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              step === item.id
                ? 'border-[#5AA4AD] text-[#3d7a82] dark:text-[#70BCBA]'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {item.done && <Check className="w-4 h-4 text-[#5AA4AD]" />}
            {item.label}
          </button>
        ))}
      </div>

      {/* Шаг 1 — гео */}
      {step === 'geo' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
              placeholder={t('psb.searchCountry')}
              className="pl-10"
            />
          </div>

          <button
            onClick={() => handleCountrySelect(null)}
            className={`w-full flex items-center gap-2 p-3 rounded-lg border-2 text-sm text-left transition-colors ${
              country === null
                ? 'border-[#5AA4AD] bg-[#5AA4AD]/10'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <Globe2 className="w-4 h-4 text-[#5AA4AD]" />
            <span className="flex-1 font-medium">{t('psb.anyCountry')}</span>
            <span className="text-xs text-gray-500">{t('psb.anyCountryHint')}</span>
          </button>

          <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
            {filteredCountries.map(item => (
              <button
                key={item.code}
                onClick={() => handleCountrySelect(item)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors ${
                  country?.code === item.code
                    ? 'border-[#5AA4AD] bg-[#5AA4AD]/10'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <CountryFlag code={item.code} />
                <span className="flex-1 truncate">{item.name}</span>
              </button>
            ))}
          </div>

          {country && (
            <div className="space-y-3 pt-2 border-t">
              {loadingGeo ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('psb.loadingGeo')}
                </div>
              ) : (
                <>
                  <GeoPicker
                    label={t('psb.state')}
                    items={states}
                    value={state}
                    onChange={setState}
                    emptyLabel={t('psb.anyState')}
                  />
                  <GeoPicker
                    label={t('psb.city')}
                    items={cities}
                    value={city}
                    onChange={setCity}
                    emptyLabel={t('psb.anyCity')}
                  />
                  <GeoPicker
                    label={t('psb.asn')}
                    items={asns}
                    value={asn}
                    onChange={setAsn}
                    emptyLabel={t('psb.anyAsn')}
                  />
                </>
              )}

              {doubleBilled && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {t('psb.doubleBillingWarning')}
                </div>
              )}

              <Button
                onClick={() => setStep('params')}
                className="w-full bg-[#5AA4AD] hover:bg-[#4b8d95] text-white"
              >
                {t('psb.next')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Шаг 2 — параметры */}
      {step === 'params' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60">
            <CountryFlag code={country?.code} className="text-xl" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium truncate">{country?.name || t('psb.anyCountry')}</div>
              <div className="text-xs text-gray-500 truncate">
                {[state?.name, city?.name, asn && `ASN ${asn.name}`].filter(Boolean).join(' · ') ||
                  t('psb.wholeCountry')}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep('geo')}>
              {t('psb.change')}
            </Button>
          </div>

          <OptionRow
            label={t('psb.rotation')}
            options={poolData.rotations}
            value={rotation}
            onChange={setRotation}
          />

          {isSticky && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('psb.sessionTtl')}</label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={sessionMinutes}
                onChange={e => setSessionMinutes(Math.max(1, parseInt(e.target.value) || 30))}
              />
              <p className="text-xs text-gray-500">{t('psb.sessionTtlHint')}</p>
            </div>
          )}

          <OptionRow
            label={t('psb.protocol')}
            options={poolData.protocols}
            value={protocol}
            onChange={setProtocol}
          />

          {poolData.hostnames.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('psb.entryPoint')}</label>
              <select
                value={hostname}
                onChange={e => setHostname(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                {poolData.hostnames.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.name}
                    {item.type === 'ip' && item.name !== item.value ? ` (${item.value})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">{t('psb.entryPointHint')}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('psb.count')}</label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={count}
              onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={generating || !hostname}
            className="w-full h-11 bg-[#5AA4AD] hover:bg-[#4b8d95] text-white font-semibold"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('psb.generating')}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                {t('psb.generateButton', { count: String(count) })}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Шаг 3 — результат */}
      {step === 'result' && (
        <div className="space-y-4">
          <div
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ borderColor: `${PSB_TEAL}55`, background: `${PSB_TEAL}14` }}
          >
            <Check className="w-5 h-5 text-[#3d7a82] flex-shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold">{t('psb.readyCount', { count: String(lines.length) })}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{t('psb.readyHint')}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep('params')}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              {t('psb.regenerate')}
            </Button>
          </div>

          <div className="border rounded-lg max-h-64 overflow-y-auto divide-y font-mono text-xs">
            {lines.map((line, index) => (
              <div key={index} className="px-3 py-2 truncate">
                {line}
              </div>
            ))}
          </div>

          <Button
            onClick={handleImport}
            className="w-full h-11 bg-[#5AA4AD] hover:bg-[#4b8d95] text-white font-semibold"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('psb.importButton', { count: String(lines.length) })}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Переключатель из справочника (протокол, ротация) */
function OptionRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PsbOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        {options.map(option => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
              value === option.value
                ? 'border-[#5AA4AD] bg-[#5AA4AD]/10 text-[#3d7a82]'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Выпадающий список региона/города/ASN с вариантом «любой» */
function GeoPicker({
  label,
  items,
  value,
  onChange,
  emptyLabel,
}: {
  label: string;
  items: PsbGeoItem[];
  value: PsbGeoItem | null;
  onChange: (item: PsbGeoItem | null) => void;
  emptyLabel: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={value?.code || ''}
        onChange={e => onChange(items.find(item => item.code === e.target.value) || null)}
        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
      >
        <option value="">{emptyLabel}</option>
        {items.map(item => (
          <option key={item.code} value={item.code}>
            {item.name}
            {item.count ? ` (${item.count})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export default PsbGenerateProxy;
