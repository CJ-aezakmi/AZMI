import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink, Key, AlertCircle, DollarSign, Loader2 } from 'lucide-react';
import {
  SXOrgClient,
  saveSXOrgApiKey,
  getSXOrgApiKey,
  removeSXOrgApiKey,
  SXOrgBalance,
  SXOrgProxyPort
} from '@/lib/sxorg-api';
import { SXOrgCreateProxy } from './SXOrgCreateProxy';
import SXOrgImportProxy from './SXOrgImportProxy';
import type { Proxy } from '@/types';

interface SXOrgIntegrationProps {
  open: boolean;
  onClose: () => void;
  onProxiesImported: (proxies: Proxy[]) => void;
}

const SXOrgIntegration = ({ open, onClose, onProxiesImported }: SXOrgIntegrationProps) => {
  const [apiKey, setApiKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [client, setClient] = useState<SXOrgClient | null>(null);
  const [balance, setBalance] = useState<SXOrgBalance | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'import'>('create');

  // Проверяем сохраненный API ключ при открытии
  useEffect(() => {
    if (open) {
      const savedKey = getSXOrgApiKey();
      if (savedKey) {
        setApiKey(savedKey);
        authenticateWithKey(savedKey);
      }
    }
  }, [open]);

  const authenticateWithKey = async (key: string) => {
    setIsLoading(true);
    setError('');

    try {
      const sxClient = new SXOrgClient(key);
      const balanceData = await sxClient.getBalance();

      if (balanceData.success) {
        setClient(sxClient);
        setBalance(balanceData);
        setIsAuthenticated(true);
        saveSXOrgApiKey(key);
      } else {
        throw new Error('Неверный API ключ');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка авторизации');
      setIsAuthenticated(false);
      setClient(null);
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    if (!apiKey.trim()) {
      setError('Введите API ключ');
      return;
    }
    await authenticateWithKey(apiKey.trim());
  };

  const handleLogout = () => {
    removeSXOrgApiKey();
    setApiKey('');
    setIsAuthenticated(false);
    setClient(null);
    setBalance(null);
  };

  const handleProxiesCreated = (proxies: SXOrgProxyPort[]) => {
    // Конвертируем SX.ORG прокси в формат приложения
    const convertedProxies: Proxy[] = proxies.map(proxy => {
      // Парсим server:port из разных форматов
      let host: string;
      let port: string;

      if (proxy.proxy && proxy.proxy.includes(':')) {
        // Новый формат: "89.39.104.79:19266"
        [host, port] = proxy.proxy.split(':');
      } else {
        // Старый формат: отдельные поля server и port
        host = proxy.server || '';
        port = proxy.port?.toString() || '';
      }

      // Получаем данные для имени
      const countryCode = (proxy.countryCode || proxy.country_code || '').toLowerCase();
      const country = proxy.country || countryCode.toUpperCase();
      const city = proxy.cityName || proxy.city;

      // Формируем название без эмодзи - иконки будут в UI
      // Используем город если есть, иначе код страны, иначе "Proxy"
      const displayName = (city && city.trim()) ? city : (countryCode ? countryCode.toUpperCase() : 'Proxy');
      const proxyName = `${displayName} - socks5://${host}:${port}`;

      return {
        id: `sxorg-${proxy.id}`,
        name: proxyName,
        enabled: true,
        type: 'socks5' as const, // SX.ORG CORPORATE прокси используют SOCKS5
        host: host,
        port: port,
        username: proxy.login,
        password: proxy.password,
        status: 'working' as const,
        metadata: {
          sxorg_id: proxy.id,
          refresh_link: proxy.refresh_link,
          country: country,
          countryCode: countryCode,
          state: proxy.stateName || proxy.state,
          city: city || displayName,
          proxy_type_id: proxy.proxy_type_id,
        }
      };
    });

    onProxiesImported(convertedProxies);
  };

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              SX.ORG Интеграция
            </DialogTitle>
            <DialogDescription>
              Подключите свой аккаунт SX.ORG для управления прокси
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Ключ</Label>
              <Input
                id="api-key"
                placeholder="Введите ваш API ключ"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAuthenticate()}
                disabled={isLoading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md text-sm">
              <p className="font-medium mb-2">Как получить API ключ:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400">
                <li>Перейдите на сайт SX.ORG</li>
                <li>Войдите в личный кабинет</li>
                <li>Перейдите в раздел "API"</li>
                <li>Скопируйте ваш API ключ</li>
              </ol>
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => window.open('https://sx.org/', '_blank')}
              className="flex-1"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Получить API ключ
            </Button>
            <Button
              onClick={handleAuthenticate}
              disabled={isLoading || !apiKey.trim()}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Проверка...
                </>
              ) : (
                'Подключить'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            SX.ORG Управление прокси
          </DialogTitle>
          <DialogDescription>
            Создавайте и управляйте прокси напрямую из приложения
          </DialogDescription>
        </DialogHeader>

        {/* Баланс */}
        {balance && (
          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Баланс</div>
              <div className="text-xl font-bold flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                {parseFloat(balance.balance).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Трафик</div>
              <div className="text-xl font-bold">{balance.balance_traffic} GB</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Доступно</div>
              <div className="text-xl font-bold">{balance.all_available_traffic} GB</div>
            </div>
          </div>
        )}

        {/* Вкладки */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'create' | 'import')} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Создать прокси</TabsTrigger>
            <TabsTrigger value="import">Импортировать прокси</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="flex-1 overflow-y-auto mt-4">
            {client && (
              <SXOrgCreateProxy
                client={client}
                onProxiesCreated={handleProxiesCreated}
              />
            )}
          </TabsContent>

          <TabsContent value="import" className="flex-1 overflow-y-auto mt-4">
            {client && (
              <SXOrgImportProxy
                client={client}
                onProxiesImported={handleProxiesCreated}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SXOrgIntegration;
