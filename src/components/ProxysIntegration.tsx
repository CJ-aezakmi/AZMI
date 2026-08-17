import { useState, useEffect, useCallback } from 'react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink, AlertCircle, Loader2, Wallet, LogOut, ShoppingCart, ListChecks } from 'lucide-react';
import {
  ProxysClient,
  saveProxysApiKey,
  getProxysApiKey,
  removeProxysApiKey,
  PROXYS_SITE_URL,
  PROXYS_CABINET_URL,
  PROXYS_TOPUP_URL,
  type ProxysBalance,
  type ProxysBuyResult,
} from '@/lib/proxys-api';
import ProxysBuyProxy from './ProxysBuyProxy';
import ProxysMyProxies, { type OrderMeta } from './ProxysMyProxies';
import { ProxysLogo } from './ProxysLogo';
import type { Proxy } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

/** Страна и тип заказа не возвращаются в GET /ip — запоминаем их при покупке */
const ORDER_META_STORAGE = 'proxys_order_meta';

function loadOrderMeta(): Record<number, OrderMeta> {
  try {
    return JSON.parse(localStorage.getItem(ORDER_META_STORAGE) || '{}');
  } catch {
    return {};
  }
}

function saveOrderMeta(meta: Record<number, OrderMeta>): void {
  localStorage.setItem(ORDER_META_STORAGE, JSON.stringify(meta));
}

interface ProxysIntegrationProps {
  open: boolean;
  onClose: () => void;
  onProxiesImported: (proxies: Proxy[]) => void;
}

const ProxysIntegration = ({ open, onClose, onProxiesImported }: ProxysIntegrationProps) => {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [client, setClient] = useState<ProxysClient | null>(null);
  const [balance, setBalance] = useState<ProxysBalance | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'buy' | 'my'>('buy');
  const [orderMeta, setOrderMeta] = useState<Record<number, OrderMeta>>(() => loadOrderMeta());
  const [reloadToken, setReloadToken] = useState(0);

  const authenticate = useCallback(async (key: string) => {
    setIsLoading(true);
    setError('');
    try {
      const nextClient = new ProxysClient(key);
      const balanceData = await nextClient.getBalance();

      setClient(nextClient);
      setBalance(balanceData);
      setIsAuthenticated(true);
      saveProxysApiKey(key);
    } catch (err: any) {
      // Показываем текст от API/бэкенда, а не общее «проверьте ключ» —
      // причина бывает и в сети, и в самом запросе
      const detail = typeof err === 'string' ? err : err?.message;
      console.error('[Proxys.io] auth failed:', err);
      setError(detail ? `${t('proxys.authError')}: ${detail}` : t('proxys.authError'));
      setIsAuthenticated(false);
      setClient(null);
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Пробуем сохранённый ключ при открытии
  useEffect(() => {
    if (!open) return;
    const savedKey = getProxysApiKey();
    if (savedKey && !isAuthenticated) {
      setApiKey(savedKey);
      authenticate(savedKey);
    }
  }, [open]);

  const refreshBalance = useCallback(async () => {
    if (!client) return;
    try {
      setBalance(await client.getBalance());
    } catch {
      // баланс не критичен — молча оставляем прежний
    }
  }, [client]);

  const handleLogout = () => {
    removeProxysApiKey();
    setApiKey('');
    setClient(null);
    setBalance(null);
    setIsAuthenticated(false);
    setError('');
  };

  const handlePurchased = (
    order: ProxysBuyResult,
    meta: { country: string; countryName: string; serviceId: number; serviceName: string },
  ) => {
    const nextMeta = {
      ...orderMeta,
      [order.order_id]: {
        country: meta.country,
        countryName: meta.countryName,
        serviceName: meta.serviceName,
      },
    };
    setOrderMeta(nextMeta);
    saveOrderMeta(nextMeta);

    toast.success(
      t('proxys.buySuccess', {
        count: String(order.count),
        price: order.price.toFixed(2),
        currency: order.currency,
      }),
    );

    // Переводим на вкладку с прокси и перезагружаем список — новый заказ уже там
    setActiveTab('my');
    setReloadToken(value => value + 1);
    refreshBalance();
  };

  // ─── Экран авторизации ───────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ProxysLogo size="lg" />
            </DialogTitle>
            <DialogDescription>{t('proxys.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="proxys-api-key">{t('proxys.apiKey')}</Label>
              <Input
                id="proxys-api-key"
                placeholder={t('proxys.apiKeyPlaceholder')}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && apiKey.trim() && authenticate(apiKey.trim())}
                disabled={isLoading}
                className="font-mono text-sm"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border border-[#75C948]/30 bg-[#75C948]/5 p-3 text-sm">
              <p className="font-medium mb-2">{t('proxys.howToGetKey')}</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400">
                <li>{t('proxys.step1')}</li>
                <li>{t('proxys.step2')}</li>
                <li>{t('proxys.step3')}</li>
                <li>{t('proxys.step4')}</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => shellOpen(PROXYS_SITE_URL)} className="flex-1">
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('proxys.getApiKey')}
            </Button>
            <Button
              onClick={() => authenticate(apiKey.trim())}
              disabled={isLoading || !apiKey.trim()}
              className="flex-1 bg-[#75C948] hover:bg-[#64b23c] text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('proxys.checking')}
                </>
              ) : (
                t('proxys.connect')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Рабочий экран ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ProxysLogo size="lg" />
          </DialogTitle>
          <DialogDescription>{t('proxys.descriptionManage')}</DialogDescription>
        </DialogHeader>

        {/* Баланс */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-[#75C948]/15 to-transparent border border-[#75C948]/30">
          <div className="w-11 h-11 rounded-lg bg-[#75C948]/20 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5 text-[#4e9a26] dark:text-[#75C948]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600 dark:text-gray-400">{t('proxys.balance')}</div>
            <div className="text-2xl font-bold text-[#3d7a1e] dark:text-[#75C948]">
              {balance ? `${Number(balance.user_balance).toFixed(2)} ${balance.currency}` : '—'}
            </div>
          </div>
          <Button variant="outline" onClick={() => shellOpen(PROXYS_TOPUP_URL)} className="border-[#75C948]/50">
            <Wallet className="w-4 h-4 mr-2" />
            {t('proxys.topUp')}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} title={t('proxys.logout')}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Вкладки */}
        <Tabs
          value={activeTab}
          onValueChange={value => setActiveTab(value as 'buy' | 'my')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className="gap-2">
              <ShoppingCart className="w-4 h-4" />
              {t('proxys.tabBuy')}
            </TabsTrigger>
            <TabsTrigger value="my" className="gap-2">
              <ListChecks className="w-4 h-4" />
              {t('proxys.tabMy')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="flex-1 overflow-y-auto mt-4 pr-1">
            {client && <ProxysBuyProxy client={client} onPurchased={handlePurchased} />}
          </TabsContent>

          <TabsContent value="my" className="flex-1 overflow-y-auto mt-4 pr-1">
            {client && (
              <ProxysMyProxies
                client={client}
                orderMeta={orderMeta}
                onProxiesImported={onProxiesImported}
                reloadToken={reloadToken}
              />
            )}
          </TabsContent>
        </Tabs>

        <button
          onClick={() => shellOpen(PROXYS_CABINET_URL)}
          className="text-xs text-gray-400 hover:text-[#4e9a26] dark:hover:text-[#75C948] transition-colors self-start"
        >
          {t('proxys.openCabinet')}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default ProxysIntegration;
