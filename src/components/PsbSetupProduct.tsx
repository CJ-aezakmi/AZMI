import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
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
  'residential-proxy-pool-3': Server,
  'residential-proxy-pool-2': Server,
  'residential-proxy-pool-1': Server,
  'mobile-proxy-pool-1': Smartphone,
  'datacenter-proxy-pool-1': Building2,
};

/**
 * Покупка трафика PSB.
 *
 * `mode="setup"` — первичное подключение: у PSB все данные привязаны к
 * суб-пользователю, а тот появляется только после покупки трафика, поэтому
 * покупка и подключение — один шаг.
 * `mode="topup"` — докупить трафик уже подключённому продукту.
 *
 * Тариф — это пакет (1, 10, 100 ГБ…) со своей ценой за гигабайт; количество
 * пакетов выбирает пользователь (`amount` в API), итог — пакет × количество.
 */
export function PsbSetupProduct({
  client,
  onReady,
  mode = 'setup',
  initialType,
}: {
  client: PsbClient;
  onReady: () => void;
  mode?: 'setup' | 'topup';
  /** Продукт, выбранный по умолчанию (в режиме докупки — активный) */
  initialType?: PsbProductId;
}) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<PsbShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Пул 3 — текущий основной тариф PSB; если его нет в каталоге, берём первый доступный
  const [productType, setProductType] = useState<PsbProductId>(
    initialType || 'residential-proxy-pool-3',
  );
  const [selected, setSelected] = useState<PsbShopProduct | null>(null);
  const [units, setUnits] = useState(1);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .getShopProducts()
      .then(list => {
        if (cancelled) return;
        setProducts(list);
        const first =
          list.find(p => p.productType === productType) ||
          PSB_PRODUCTS.map(p => list.find(item => item.productType === p.id)).find(Boolean);
        if (first) {
          setProductType(first.productType);
          setSelected(first);
        }
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

  const totalGb = selected ? selected.trafficGb * units : 0;
  const totalPrice = selected ? selected.price * units : 0;

  const handleBuy = async () => {
    if (!selected) return;
    setBuying(true);
    setError('');
    try {
      if (mode === 'topup') {
        await client.buyProduct(selected.id, units);
        toast.success(t('psb.topUpSuccess', { gb: String(totalGb) }));
      } else {
        const { subUser, trafficMoved } = await client.provisionProduct(
          productType,
          selected.id,
          units,
          selected.trafficGb,
        );
        toast.success(
          trafficMoved
            ? t('psb.provisionSuccess', { gb: String(totalGb), id: String(subUser.id) })
            : t('psb.provisionPartial', { id: String(subUser.id) }),
        );
      }
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
          <div className="font-semibold">
            {mode === 'topup' ? t('psb.topUpTitle') : t('psb.setupTitle')}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {mode === 'topup' ? t('psb.topUpHint') : t('psb.setupHint')}
          </div>
        </div>
      </div>

      {/* Тип прокси */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('psb.setupType')}</label>
        <div className={`grid gap-2 ${availableTypes.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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

      {/* Тарифы: чем больше пакет, тем дешевле гигабайт */}
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

      {/* Количество пакетов → итоговые гигабайты */}
      {selected && (
        <div className="flex items-end gap-3">
          <div className="space-y-2 w-40">
            <label className="text-sm font-medium">{t('psb.setupUnits')}</label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={units}
              onChange={e => setUnits(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
            />
          </div>
          <div className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 text-sm">
            <div className="text-xs text-gray-500">{t('psb.setupTotal')}</div>
            <div className="font-semibold">
              {units} × {selected.trafficGb} GB = {totalGb} GB ·{' '}
              <span className="text-[#2A323D] dark:text-[#70BCBA]">${totalPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

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
              ? mode === 'topup'
                ? t('psb.topUpButton', { gb: String(totalGb), price: totalPrice.toFixed(2) })
                : t('psb.buyAndCreate', { gb: String(totalGb), price: totalPrice.toFixed(2) })
              : t('psb.setupPackage')}
          </>
        )}
      </Button>

      <p className="text-[11px] text-gray-500 text-center">{t('psb.buyFromBalance')}</p>
    </div>
  );
}

export default PsbSetupProduct;
