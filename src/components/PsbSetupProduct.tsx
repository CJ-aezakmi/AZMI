import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, ShoppingCart, AlertCircle, Server, Smartphone, Building2 } from 'lucide-react';
import {
  PsbClient,
  PSB_PRODUCTS,
  type PsbProductId,
  type PsbShopProduct,
} from '@/lib/psb-api';
import { PSB_TEAL } from './PsbLogo';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

const TYPE_ICONS: Record<string, typeof Server> = {
  'residential-proxy-pool-1': Server,
  'mobile-proxy-pool-1': Smartphone,
  'datacenter-proxy-pool-1': Building2,
};

/**
 * Первичное подключение продукта PSB.
 *
 * У PSB все данные привязаны к суб-пользователю, а тот появляется только после
 * покупки трафика: на пустом аккаунте и «Get Data», и создание суб-пользователя
 * отвечают 404. Поэтому здесь единый шаг — купить тариф и сразу получить
 * рабочий суб-аккаунт.
 */
export function PsbSetupProduct({
  client,
  onReady,
}: {
  client: PsbClient;
  onReady: () => void;
}) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<PsbShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [productType, setProductType] = useState<PsbProductId>('residential-proxy-pool-1');
  const [selected, setSelected] = useState<PsbShopProduct | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .getShopProducts()
      .then(list => {
        if (cancelled) return;
        setProducts(list);
        const first = list.find(p => p.productType === productType);
        if (first) setSelected(first);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || t('psb.shopError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  /** Типы, для которых в магазине действительно есть тарифы */
  const availableTypes = useMemo(() => {
    const present = new Set(products.map(p => p.productType));
    return PSB_PRODUCTS.filter(p => present.has(p.id));
  }, [products]);

  const typeProducts = useMemo(
    () => products.filter(p => p.productType === productType),
    [products, productType],
  );

  const handleSelectType = (next: PsbProductId) => {
    setProductType(next);
    setSelected(products.find(p => p.productType === next) || null);
  };

  const handleBuy = async () => {
    if (!selected) return;
    setBuying(true);
    setError('');
    try {
      const { subUser, trafficMoved } = await client.provisionProduct(
        productType,
        selected.id,
        1,
        selected.trafficGb,
      );

      toast.success(
        trafficMoved
          ? t('psb.provisionSuccess', { gb: String(selected.trafficGb), id: String(subUser.id) })
          : t('psb.provisionPartial', { id: String(subUser.id) }),
      );
      onReady();
    } catch (err: any) {
      setError(err?.message || t('psb.provisionError'));
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-[#5AA4AD]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        className="flex items-start gap-3 p-4 rounded-xl border"
        style={{ borderColor: `${PSB_TEAL}55`, background: `${PSB_TEAL}14` }}
      >
        <AlertCircle className="w-5 h-5 text-[#3d7a82] flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-semibold">{t('psb.setupTitle')}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{t('psb.setupHint')}</div>
        </div>
      </div>

      {/* Тип прокси */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('psb.setupType')}</label>
        <div className="grid grid-cols-3 gap-2">
          {availableTypes.map(item => {
            const Icon = TYPE_ICONS[item.id] || Server;
            const cheapest = products
              .filter(p => p.productType === item.id)
              .reduce<PsbShopProduct | null>(
                (min, p) => (!min || p.pricePerGb < min.pricePerGb ? p : min),
                null,
              );
            return (
              <button
                key={item.id}
                onClick={() => handleSelectType(item.id)}
                className={`p-3 rounded-xl border-2 text-left transition-colors ${
                  productType === item.id
                    ? 'border-[#5AA4AD] bg-[#5AA4AD]/10'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="w-5 h-5 mb-1.5 text-[#3d7a82]" />
                <div className="text-sm font-medium leading-tight">{t(item.labelKey)}</div>
                {cheapest && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    {t('psb.fromPerGb', { price: cheapest.pricePerGb.toFixed(2) })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Тарифы */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('psb.setupPackage')}</label>
        <div className="grid grid-cols-2 gap-2">
          {typeProducts.map(item => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className={`flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                selected?.id === item.id
                  ? 'border-[#5AA4AD] bg-[#5AA4AD]/10'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div className="text-left">
                <div className="text-sm font-semibold">{item.trafficGb} GB</div>
                <div className="text-[11px] text-gray-500">
                  ${item.pricePerGb.toFixed(2)}/GB
                  {item.discount > 0 && (
                    <span className="ml-1 text-[#4e9a26]">−{item.discount}%</span>
                  )}
                </div>
              </div>
              <div className="text-lg font-bold text-[#2A323D] dark:text-[#70BCBA]">${item.price}</div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleBuy}
        disabled={buying || !selected}
        className="w-full h-11 bg-[#5AA4AD] hover:bg-[#4b8d95] text-white font-semibold"
      >
        {buying ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t('psb.provisioning')}
          </>
        ) : (
          <>
            <ShoppingCart className="w-4 h-4 mr-2" />
            {selected
              ? t('psb.buyAndCreate', { gb: String(selected.trafficGb), price: String(selected.price) })
              : t('psb.setupPackage')}
          </>
        )}
      </Button>

      <p className="text-[11px] text-gray-500 text-center">{t('psb.buyFromBalance')}</p>
    </div>
  );
}

export default PsbSetupProduct;
