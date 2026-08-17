import { useState, useEffect, useCallback } from 'react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink, AlertCircle, Loader2, LogOut, Gauge } from 'lucide-react';
import {
  PsbClient,
  savePsbToken,
  getPsbToken,
  removePsbToken,
  PSB_GET_PROXY_URL,
  type PsbProduct,
  type PsbProductId,
  type PsbPoolData,
} from '@/lib/psb-api';
import PsbGenerateProxy from './PsbGenerateProxy';
import PsbSetupProduct from './PsbSetupProduct';
import { PsbLogo, PSB_TEAL } from './PsbLogo';
import type { Proxy } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

interface PsbIntegrationProps {
  open: boolean;
  onClose: () => void;
  onProxiesImported: (proxies: Proxy[]) => void;
}

const PsbIntegration = ({ open, onClose, onProxiesImported }: PsbIntegrationProps) => {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [client, setClient] = useState<PsbClient | null>(null);
  /** Продукты, реально доступные аккаунту, вместе с их данными */
  const [available, setAvailable] = useState<{ product: PsbProduct; data: PsbPoolData }[]>([]);
  const [activeProduct, setActiveProduct] = useState<PsbProductId>('residential-proxy-pool-1');
  /** У аккаунта ещё нет ни одного оплаченного продукта */
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const authenticate = useCallback(
    async (value: string) => {
      setIsLoading(true);
      setError('');
      try {
        const nextClient = new PsbClient(value);
        // «Get Data» по каждому продукту: заодно проверяет токен и даёт баланс
        const { products, subUsers } = await nextClient.discoverProducts();

        setClient(nextClient);
        setAvailable(products);
        if (products.length > 0) setActiveProduct(products[0].product.id);
        // Пустой аккаунт — не ошибка: предложим купить тариф и завести суб-аккаунт
        setNeedsSetup(products.length === 0);
        setIsAuthenticated(true);
        savePsbToken(value);
      } catch (err: any) {
        const detail = typeof err === 'string' ? err : err?.message;
        console.error('[PSB] auth failed:', err);
        setError(detail ? `${t('psb.authError')}: ${detail}` : t('psb.authError'));
        setIsAuthenticated(false);
        setClient(null);
        setAvailable([]);
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!open) return;
    const saved = getPsbToken();
    if (saved && !isAuthenticated) {
      setToken(saved);
      authenticate(saved);
    }
  }, [open]);

  /** Перечитывает данные активного продукта — после генерации трафик меняется */
  const refreshActive = useCallback(async () => {
    if (!client) return;
    try {
      const data = await client.getPoolData(activeProduct);
      setAvailable(prev =>
        prev.map(item => (item.product.id === activeProduct ? { ...item, data } : item)),
      );
    } catch {
      /* остаток трафика не критичен для работы */
    }
  }, [client, activeProduct]);

  const handleLogout = () => {
    removePsbToken();
    setToken('');
    setClient(null);
    setAvailable([]);
    setIsAuthenticated(false);
    setError('');
  };

  const handleGenerated = (proxies: Proxy[]) => {
    onProxiesImported(proxies);
    toast.success(t('psb.importedCount', { count: String(proxies.length) }));
    refreshActive();
  };

  // ─── Экран токена ────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <PsbLogo size="lg" />
            </DialogTitle>
            <DialogDescription>{t('psb.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="psb-token">{t('psb.apiToken')}</Label>
              <Input
                id="psb-token"
                placeholder={t('psb.apiTokenPlaceholder')}
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && token.trim() && authenticate(token.trim())}
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

            <div
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: `${PSB_TEAL}55`, background: `${PSB_TEAL}0f` }}
            >
              <p className="font-medium mb-2">{t('psb.howToGetToken')}</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400">
                <li>{t('psb.step1')}</li>
                <li>{t('psb.step2')}</li>
                <li>{t('psb.step3')}</li>
                <li>{t('psb.step4')}</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => shellOpen(PSB_GET_PROXY_URL)} className="flex-1">
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('psb.getProxy')}
            </Button>
            <Button
              onClick={() => authenticate(token.trim())}
              disabled={isLoading || !token.trim()}
              className="flex-1 bg-[#5AA4AD] hover:bg-[#4b8d95] text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('psb.checking')}
                </>
              ) : (
                t('psb.connect')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Рабочий экран ───────────────────────────────────────────────────
  const current = available.find(item => item.product.id === activeProduct) || available[0];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <PsbLogo size="lg" />
          </DialogTitle>
          <DialogDescription>{t('psb.descriptionManage')}</DialogDescription>
        </DialogHeader>

        {/* Остаток трафика активного продукта */}
        <div
          className="flex items-center gap-4 p-4 rounded-xl border"
          style={{ borderColor: `${PSB_TEAL}55`, background: `${PSB_TEAL}14` }}
        >
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${PSB_TEAL}33` }}
          >
            <Gauge className="w-5 h-5 text-[#3d7a82]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600 dark:text-gray-400">{t('psb.trafficLeft')}</div>
            <div className="text-2xl font-bold text-[#2A323D] dark:text-[#70BCBA]">
              {current ? `${current.data.trafficAvailable.toFixed(2)} GB` : '—'}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {current ? t(current.product.labelKey) : t('psb.noProductYet')}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => shellOpen(PSB_GET_PROXY_URL)}
            style={{ borderColor: `${PSB_TEAL}80` }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {t('psb.topUp')}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} title={t('psb.logout')}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {client && needsSetup && (
            <PsbSetupProduct
              client={client}
              onReady={() => {
                setNeedsSetup(false);
                authenticate(token.trim());
              }}
            />
          )}
          {client && !needsSetup && current && (
            <PsbGenerateProxy
              client={client}
              available={available}
              activeProduct={activeProduct}
              poolData={current.data}
              onProductChange={setActiveProduct}
              onProxiesGenerated={handleGenerated}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PsbIntegration;
