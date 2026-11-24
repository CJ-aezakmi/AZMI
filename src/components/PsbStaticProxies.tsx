import { useState, useEffect, useCallback, useMemo } from 'react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Download,
  Repeat,
  Server,
  Globe2,
  KeyRound,
  ShoppingCart,
} from 'lucide-react';
import {
  PsbClient,
  parseProxyLine,
  PSB_STATIC_SITE_URL,
  type PsbStaticSubscription,
  type PsbStaticPackage,
  type PsbStaticPurpose,
} from '@/lib/psb-api';
import { PSB_TEAL } from './PsbLogo';
import type { Proxy } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

/**
 * Статичные прокси PSB: подписки с фиксированными IP на месяц.
 *
 * Проверено живым API 24.11.2026: подписка приходит с `ip_addresses =
 * {login, password, ips: ["ip:port"]}`, один порт обслуживает HTTP и SOCKS5,
 * покупка — `POST /products/{id}/buy` с назначением и страной из
 * `/static-proxy/packages/{id}/details`. Ручной ввод учёток остаётся на случай,
 * если у какой-то подписки их в ответе не окажется.
 */
export function PsbStaticProxies({
  client,
  view,
  onProxiesImported,
  onBought,
}: {
  client: PsbClient;
  /** `buy` — покупка пакета, `list` — купленные подписки и импорт */
  view: 'buy' | 'list';
  onProxiesImported: (proxies: Proxy[]) => void;
  onBought?: () => void;
}) {
  const { t } = useTranslation();
  const [subs, setSubs] = useState<PsbStaticSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  /** Подписка, для которой нажали «Сменить IP» и ждём подтверждения вторым нажатием */
  const [swapConfirmId, setSwapConfirmId] = useState<number | null>(null);

  // Учётные данные вручную — только если PSB их не прислал
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState<'http' | 'socks5'>('http');

  // Покупка
  const buyOpen = view === 'buy';
  const [packages, setPackages] = useState<PsbStaticPackage[]>([]);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [purposes, setPurposes] = useState<PsbStaticPurpose[]>([]);
  const [purposeId, setPurposeId] = useState<number | null>(null);
  const [country, setCountry] = useState('Any');
  const [count, setCount] = useState(1);
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await client.listStaticSubscriptions();
      setSubs(list);
      setSelected(prev => {
        const next = new Set<number>();
        for (const sub of list) {
          if (sub.status === 'active' && (prev.size === 0 || prev.has(sub.id))) next.add(sub.id);
        }
        return next;
      });
    } catch (err: any) {
      setError(err?.message || t('psb.staticLoadError'));
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Каталог статичных пакетов — один раз при открытии панели покупки
  useEffect(() => {
    if (!buyOpen || packages.length > 0) return;
    client
      .getStaticPackages()
      .then(list => {
        setPackages(list);
        if (list.length > 0 && packageId === null) setPackageId(list[0].id);
      })
      .catch(err => setBuyError(err?.message || t('psb.shopError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyOpen]);

  // Назначения и страны выбранного пакета
  useEffect(() => {
    if (packageId === null) return;
    let cancelled = false;
    setLoadingDetails(true);
    setBuyError('');
    client
      .getStaticPackageDetails(packageId)
      .then(details => {
        if (cancelled) return;
        setPurposes(details.purposes);
        const first = details.purposes[0];
        setPurposeId(first ? first.id : null);
        setCountry('Any');
      })
      .catch(err => {
        if (!cancelled) setBuyError(err?.message || t('psb.staticDetailsError'));
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId]);

  const currentPackage = packages.find(p => p.id === packageId) || null;
  const currentPurpose = purposes.find(p => p.id === purposeId) || null;
  /** Страны назначения: «Any» первой, остальные по алфавиту */
  const countryOptions = useMemo(() => {
    if (!currentPurpose) return [] as [string, number][];
    const entries = Object.entries(currentPurpose.countries).filter(([name]) => name !== 'Any');
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const any = currentPurpose.countries.Any;
    return any !== undefined ? ([['Any', any], ...entries] as [string, number][]) : entries;
  }, [currentPurpose]);
  const availableForCountry = currentPurpose?.countries[country] ?? 0;
  const totalPrice = currentPackage ? currentPackage.pricePerIp * count : 0;

  const handleBuy = async () => {
    if (!currentPackage || purposeId === null) return;
    setBuying(true);
    setBuyError('');
    try {
      const created = await client.buyStaticPackage({
        productId: currentPackage.id,
        purposeId,
        country,
        count,
        autoRenewal,
      });
      toast.success(
        created ? t('psb.staticBought', { id: String(created.id) }) : t('psb.staticBoughtNoSub'),
      );
      await load();
      if (created) setSelected(prev => new Set(prev).add(created.id));
      onBought?.();
    } catch (err: any) {
      setBuyError(err?.message || t('psb.staticBuyError'));
    } finally {
      setBuying(false);
    }
  };

  /** Ответ по одной подписке не содержит category_name — сохраняем его из списка */
  const replaceSub = (next: PsbStaticSubscription) =>
    setSubs(prev =>
      prev.map(sub =>
        sub.id === next.id ? { ...next, categoryName: next.categoryName ?? sub.categoryName } : sub,
      ),
    );

  const toggleSelected = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSwap = async (sub: PsbStaticSubscription) => {
    if (swapConfirmId !== sub.id) {
      setSwapConfirmId(sub.id);
      return;
    }
    setSwapConfirmId(null);
    setBusyId(sub.id);
    try {
      replaceSub(await client.swapStaticIps(sub.id));
      toast.success(t('psb.staticSwapDone'));
    } catch (err: any) {
      toast.error(err?.message || t('psb.staticActionError'));
    } finally {
      setBusyId(null);
    }
  };

  const handleAutoRenewal = async (sub: PsbStaticSubscription, enabled: boolean) => {
    setBusyId(sub.id);
    try {
      replaceSub(await client.setStaticAutoRenewal(sub.id, enabled));
    } catch (err: any) {
      toast.error(err?.message || t('psb.staticActionError'));
    } finally {
      setBusyId(null);
    }
  };

  /** Строит прокси AEZAKMI из подписки; null — не хватает учёток */
  const buildProxies = (sub: PsbStaticSubscription): Proxy[] | null => {
    const place = sub.country || t('psb.anyCountry');
    const service = sub.categoryName || 'PSB Static';
    const expiresAt = sub.expiresAt ? Math.floor(Date.parse(sub.expiresAt) / 1000) : undefined;
    const metadata = {
      psb_static_subscription: sub.id,
      service,
      country: sub.country || undefined,
      expires_at: Number.isFinite(expiresAt) ? expiresAt : undefined,
    };

    // Основной путь: PSB отдаёт логин, пароль и ip:port — строки готовы
    if (sub.proxyLines.length > 0) {
      return sub.proxyLines
        .map(parseProxyLine)
        .filter(Boolean)
        .map(parsed => ({
          id: `psb-static-${sub.id}-${parsed!.host}-${parsed!.port}`,
          name: `PSB Static · ${place} · ${parsed!.host}`,
          enabled: true,
          type: protocol,
          host: parsed!.host,
          port: parsed!.port,
          username: parsed!.username,
          password: parsed!.password,
          status: 'unchecked' as const,
          metadata,
        }));
    }

    const creds = sub.credentials || {};
    const useLogin = creds.login || login.trim();
    const usePassword = creds.password || password.trim();
    const fallbackPort = (protocol === 'socks5' && creds.socksPort) || creds.port || port.trim();
    if (sub.ipAddresses.length === 0) return null;

    const proxies: Proxy[] = [];
    for (const entry of sub.ipAddresses) {
      const [host, ownPort] = entry.split(':');
      const usePort = ownPort || fallbackPort;
      if (!host || !usePort) continue;
      proxies.push({
        id: `psb-static-${sub.id}-${host}-${usePort}`,
        name: `PSB Static · ${place} · ${host}`,
        enabled: true,
        type: protocol,
        host,
        port: usePort,
        username: useLogin || undefined,
        password: usePassword || undefined,
        status: 'unchecked' as const,
        metadata,
      });
    }
    return proxies.length > 0 ? proxies : null;
  };

  const handleImport = () => {
    const chosen = subs.filter(sub => selected.has(sub.id));
    const result: Proxy[] = [];
    let missing = 0;
    for (const sub of chosen) {
      const proxies = buildProxies(sub);
      if (!proxies) {
        missing += 1;
        continue;
      }
      result.push(...proxies);
    }
    if (result.length === 0) {
      toast.error(missing > 0 ? t('psb.staticNeedCredentials') : t('psb.staticNoIps'));
      return;
    }
    if (missing > 0) toast.warning(t('psb.staticNeedCredentials'));
    onProxiesImported(result);
  };

  const selectedIpCount = useMemo(
    () =>
      subs
        .filter(sub => selected.has(sub.id))
        .reduce((sum, sub) => sum + (sub.proxyLines.length || sub.ipAddresses.length), 0),
    [subs, selected],
  );

  /** Ручные учётки нужны, если выбранная подписка не принесла их сама */
  const needsManualCreds = subs.some(
    sub =>
      selected.has(sub.id) &&
      sub.proxyLines.length === 0 &&
      !(sub.credentials?.login && sub.credentials?.password),
  );

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  };

  const statusLabel = (status: string) => {
    if (status === 'active') return t('psb.staticStatusActive');
    if (status === 'expired') return t('psb.staticStatusExpired');
    if (status === 'cancelled') return t('psb.staticStatusCancelled');
    return status;
  };

  const selectClass =
    'w-full h-10 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3 p-4 rounded-xl border"
        style={{ borderColor: `${PSB_TEAL}55`, background: `${PSB_TEAL}14` }}
      >
        <Server className="w-5 h-5 text-[#3d7a82] flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm min-w-0">
          <div className="font-semibold">
            {buyOpen ? t('psb.staticBuyTitle') : t('psb.tabMine')}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {buyOpen ? t('psb.staticHint') : t('psb.staticMineHint')}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {!buyOpen && (
              <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                {t('psb.staticRefresh')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => shellOpen(PSB_STATIC_SITE_URL)}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              {t('psb.staticOpenSite')}
            </Button>
          </div>
        </div>
      </div>

      {/* Покупка */}
      {buyOpen && (
        <div className="space-y-3 p-4 rounded-xl border-2 border-[#5AA4AD]/60">
          {packages.length === 0 && !buyError ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('psb.checking')}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('psb.staticPackage')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {packages.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setPackageId(item.id)}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        packageId === item.id
                          ? 'border-[#5AA4AD] bg-[#5AA4AD]/10'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="text-sm font-medium leading-tight">
                        {item.categoryName || item.title}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        ${item.pricePerIp.toFixed(2)} / IP
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t('psb.staticPurpose')}
                  </label>
                  <select
                    value={purposeId ?? ''}
                    disabled={loadingDetails || purposes.length === 0}
                    onChange={e => {
                      setPurposeId(Number(e.target.value));
                      setCountry('Any');
                    }}
                    className={selectClass}
                  >
                    {purposes.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t('psb.staticCountry')}
                  </label>
                  <select
                    value={country}
                    disabled={loadingDetails || countryOptions.length === 0}
                    onChange={e => setCountry(e.target.value)}
                    className={selectClass}
                  >
                    {countryOptions.map(([name, available]) => (
                      <option key={name} value={name}>
                        {name === 'Any' ? t('psb.staticAnyCountry') : name} ·{' '}
                        {t('psb.staticAvailable', { count: String(available) })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t('psb.staticCount')}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, Math.min(1000, availableForCountry || 1000))}
                    value={count}
                    onChange={e =>
                      setCount(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))
                    }
                  />
                </div>
                <label className="flex items-center gap-2 h-10 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRenewal}
                    onChange={e => setAutoRenewal(e.target.checked)}
                    className="accent-[#5AA4AD]"
                  />
                  {t('psb.staticAutoRenew')}
                </label>
              </div>

              {buyError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{buyError}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleBuy}
                disabled={buying || loadingDetails || !currentPackage || purposeId === null || availableForCountry === 0}
                className="w-full h-11 bg-[#5AA4AD] hover:bg-[#4b8d95] text-white font-semibold"
              >
                {buying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('psb.staticBuying')}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    {t('psb.staticBuyButton', {
                      count: String(count),
                      price: totalPrice.toFixed(2),
                    })}
                  </>
                )}
              </Button>
              <p className="text-[11px] text-gray-500 text-center">{t('psb.buyFromBalance')}</p>
            </>
          )}
        </div>
      )}

      {view === 'list' && (
        <>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && subs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-7 h-7 animate-spin text-[#5AA4AD]" />
        </div>
      ) : subs.length === 0 ? (
        !error && (
          <div className="text-center py-10 text-sm text-gray-500">
            <div className="font-medium text-gray-700 dark:text-gray-300">{t('psb.staticEmpty')}</div>
            <div className="text-xs mt-1">{t('psb.staticEmptyHint')}</div>
          </div>
        )
      ) : (
        <>
          {/* Протокол импорта + ручные учётки, если их нет в ответе */}
          <div className="space-y-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="w-4 h-4 text-[#3d7a82]" />
              {needsManualCreds ? t('psb.staticCredentials') : t('psb.staticProtocol')}
            </div>
            {needsManualCreds && (
              <p className="text-xs text-gray-500">{t('psb.staticCredentialsHint')}</p>
            )}
            <div className={`grid gap-2 ${needsManualCreds ? 'grid-cols-4' : 'grid-cols-1'}`}>
              {needsManualCreds && (
                <>
                  <Input
                    placeholder={t('psb.staticLogin')}
                    value={login}
                    onChange={e => setLogin(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Input
                    placeholder={t('psb.staticPassword')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Input
                    placeholder={t('psb.staticPort')}
                    value={port}
                    inputMode="numeric"
                    onChange={e => setPort(e.target.value.replace(/\D/g, ''))}
                    className="font-mono text-sm"
                  />
                </>
              )}
              <select
                value={protocol}
                onChange={e => setProtocol(e.target.value as 'http' | 'socks5')}
                className={selectClass}
              >
                <option value="http">HTTP/HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
          </div>

          {/* Подписки */}
          <div className="space-y-2">
            {subs.map(sub => {
              const checked = selected.has(sub.id);
              const busy = busyId === sub.id;
              const active = sub.status === 'active';
              return (
                <div
                  key={sub.id}
                  className={`rounded-lg border-2 p-3 transition-colors ${
                    checked
                      ? 'border-[#5AA4AD] bg-[#5AA4AD]/5'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(sub.id)}
                      className="mt-1 accent-[#5AA4AD]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Globe2 className="w-4 h-4 text-[#5AA4AD]" />
                        <span className="text-sm font-medium truncate">{sub.title}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {statusLabel(sub.status)}
                        </span>
                        {sub.stale && (
                          <span className="text-[10px] text-amber-600">{t('psb.staticStale')}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {[
                          sub.categoryName,
                          sub.purposeName,
                          sub.country,
                          t('psb.staticIps', { count: String(sub.ipCount) }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {' · '}
                        {t('psb.staticExpires', { date: formatDate(sub.expiresAt) })}
                      </div>
                      {sub.ipAddresses.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sub.ipAddresses.map(ip => (
                            <span
                              key={ip}
                              className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800"
                            >
                              {ip}
                            </span>
                          ))}
                          {sub.credentials?.login && (
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                              {sub.credentials.login}:{sub.credentials.password ? '••••••' : '?'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-600 mt-1">{t('psb.staticNoIps')}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Button
                        variant={swapConfirmId === sub.id ? 'destructive' : 'outline'}
                        size="sm"
                        disabled={busy || !active}
                        onClick={() => handleSwap(sub)}
                        onBlur={() => swapConfirmId === sub.id && setSwapConfirmId(null)}
                      >
                        {busy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Repeat className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {swapConfirmId === sub.id ? t('psb.staticSwapConfirm') : t('psb.staticSwap')}
                      </Button>
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sub.autoRenewal}
                          disabled={busy || !active}
                          onChange={e => handleAutoRenewal(sub, e.target.checked)}
                          className="accent-[#5AA4AD]"
                        />
                        {t('psb.staticAutoRenew')}
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            onClick={handleImport}
            disabled={selected.size === 0 || selectedIpCount === 0}
            className="w-full h-11 bg-[#5AA4AD] hover:bg-[#4b8d95] text-white font-semibold"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('psb.staticImportSelected', { count: String(selectedIpCount) })}
          </Button>
        </>
      )}
        </>
      )}
    </div>
  );
}

export default PsbStaticProxies;
