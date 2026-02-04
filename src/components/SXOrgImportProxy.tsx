import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, Search, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import { SXOrgClient, SXOrgProxyPort } from '@/lib/sxorg-api';
import { toast } from 'sonner';

interface SXOrgImportProxyProps {
  client: SXOrgClient;
  onProxiesImported: (proxies: SXOrgProxyPort[]) => void;
}

const SXOrgImportProxy = ({ client, onProxiesImported }: SXOrgImportProxyProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [proxies, setProxies] = useState<SXOrgProxyPort[]>([]);
  const [selectedProxies, setSelectedProxies] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadProxies();
  }, []);

  const loadProxies = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await client.getProxies();
      setProxies(response.data || []);
    } catch (err: any) {
      const errorMsg = err.message || 'Ошибка загрузки прокси';
      setError(errorMsg);
      toast.error(errorMsg);
      setProxies([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProxy = (proxyId: number) => {
    const newSelected = new Set(selectedProxies);
    if (newSelected.has(proxyId)) {
      newSelected.delete(proxyId);
    } else {
      newSelected.add(proxyId);
    }
    setSelectedProxies(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedProxies.size === filteredProxies.length) {
      setSelectedProxies(new Set());
    } else {
      setSelectedProxies(new Set(filteredProxies.map(p => p.id)));
    }
  };

  const handleImport = () => {
    const selected = proxies.filter(p => selectedProxies.has(p.id));
    if (selected.length === 0) {
      toast.error('Выберите хотя бы один прокси');
      return;
    }

    // Конвертируем прокси с правильными названиями и метаданными
    const convertedProxies = selected.map(proxy => {
      // Парсим server:port из разных форматов
      let host: string;
      let port: string;

      if (proxy.proxy && proxy.proxy.includes(':')) {
        [host, port] = proxy.proxy.split(':');
      } else {
        host = proxy.server || '';
        port = proxy.port?.toString() || '';
      }

      // Получаем данные для имени
      let countryCode = (proxy.countryCode || proxy.country_code || '').toLowerCase();

      // Если кода страны нет, пытаемся извлечь из логина (формат: xxx-country-XX-...)
      if (!countryCode && proxy.login) {
        const match = proxy.login.match(/country-([A-Z]{2})/i);
        if (match) {
          countryCode = match[1].toLowerCase();
        }
      }

      // Формируем название страны из кода
      const country = countryCode ? countryCode.toUpperCase() : 'Proxy';

      // Всегда формируем название заново для импортированных прокси
      const city = proxy.cityName || proxy.city;
      // Используем город если есть, иначе код страны
      const displayName = city && city.trim() ? city : country;
      const proxyName = `${displayName} - socks5://${host}:${port}`;


      return {
        ...proxy,
        name: proxyName,
        countryCode: countryCode,
        metadata: {
          ...proxy.metadata,
          sxorg_id: proxy.id,
          refresh_link: proxy.refresh_link,
          country: country,
          countryCode: countryCode,
          state: proxy.stateName || proxy.state,
          city: proxy.cityName || proxy.city,
          proxy_type_id: proxy.proxy_type_id,
        }
      };
    });

    onProxiesImported(convertedProxies);
    toast.success(`Импортировано ${selected.length} прокси`);
    setSelectedProxies(new Set());
  };

  const handleDelete = async (proxyId: number) => {
    if (!confirm('Удалить прокси?')) return;

    try {
      await client.deleteProxy(proxyId);
      toast.success('Прокси удален');
      loadProxies();
    } catch (err: any) {
      toast.error(err.message || 'Ошибка удаления прокси');
    }
  };

  const handleRefreshIP = async (proxy: SXOrgProxyPort) => {
    if (!proxy.refresh_link) {
      toast.error('Ссылка для обновления IP недоступна');
      return;
    }

    try {
      await client.refreshProxyIP(proxy.refresh_link);
      toast.success('IP адрес обновлен');
      await loadProxies();
    } catch (err: any) {
      toast.error(err.message || 'Ошибка обновления IP');
    }
  };

  const filteredProxies = (proxies || []).filter(proxy => {
    const host = proxy.proxy || proxy.server || '';
    const country = proxy.countryCode || proxy.country_code || '';
    return (
      proxy.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      host.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (isLoading && (!proxies || proxies.length === 0)) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Поиск и действия */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Введите название гео, прокси логин или IP"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={loadProxies} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Кнопки действий */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          <CheckCircle className="w-4 h-4 mr-2" />
          Выбрать все
        </Button>
        <Button
          onClick={handleImport}
          disabled={selectedProxies.size === 0}
          size="sm"
        >
          <Download className="w-4 h-4 mr-2" />
          Импортировать ({selectedProxies.size})
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Список прокси */}
      <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
        {filteredProxies.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery ? 'Прокси не найдены' : 'У вас пока нет прокси'}
          </div>
        ) : (
          filteredProxies.map(proxy => (
            <div
              key={proxy.id}
              className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${selectedProxies.has(proxy.id) ? 'bg-primary/5' : ''
                }`}
            >
              <div className="flex items-center gap-3">
                {/* Чекбокс */}
                <button
                  onClick={() => handleSelectProxy(proxy.id)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedProxies.has(proxy.id)
                      ? 'bg-primary border-primary'
                      : 'border-gray-300 dark:border-gray-600'
                    }`}
                >
                  {selectedProxies.has(proxy.id) && (
                    <CheckCircle className="w-4 h-4 text-white" />
                  )}
                </button>

                {/* Иконки типов устройств */}
                <div className="flex gap-1">
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5.83333 1.83337H11.1667V0.833374H5.83333V1.83337ZM12 2.66671V13.3334H13V2.66671H12ZM11.1667 14.1667H5.83333V15.1667H11.1667V14.1667ZM5 13.3334V2.66671H4V13.3334H5ZM5.83333 14.1667C5.3731 14.1667 5 13.7936 5 13.3334H4C4 14.3459 4.82081 15.1667 5.83333 15.1667V14.1667ZM12 13.3334C12 13.7936 11.6269 14.1667 11.1667 14.1667V15.1667C12.1792 15.1667 13 14.3459 13 13.3334H12ZM11.1667 1.83337C11.6269 1.83337 12 2.20647 12 2.66671H13C13 1.65419 12.1792 0.833374 11.1667 0.833374V1.83337ZM5.83333 0.833374C4.82081 0.833374 4 1.65418 4 2.66671H5C5 2.20647 5.3731 1.83337 5.83333 1.83337V0.833374Z" fill="#87898F" />
                      <path d="M7.16675 12.8334H9.83341" stroke="#87898F" strokeMiterlimit="1.02018" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8.5 3H8.50667" stroke="#87898F" strokeMiterlimit="1.02018" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 12.6667V7.31878C14 6.90732 13.81 6.51892 13.4853 6.26631L8.81859 2.63668C8.33711 2.26219 7.66289 2.26219 7.18141 2.63668L2.51475 6.26631C2.18996 6.51892 2 6.90732 2 7.31878V12.6667C2 13.403 2.59695 14 3.33333 14H5.16667C5.90305 14 6.5 13.403 6.5 12.6667V10.8333C6.5 10.097 7.09695 9.5 7.83333 9.5H8.16667C8.90305 9.5 9.5 10.097 9.5 10.8333V12.6667C9.5 13.403 10.097 14 10.8333 14H12.6667C13.403 14 14 13.403 14 12.6667Z" stroke="#87898F" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12.8125 4.375V5.5M10 4.375V5.5M7.1875 4.375V5.5M12.8125 7.75V8.875M10 7.75V8.875M7.1875 7.75V8.875M12.8125 11.125V12.25M10 11.125V12.25M7.1875 11.125V12.25M15.625 18.4375V2.125C15.625 1.81394 15.3736 1.5625 15.0625 1.5625H4.9375C4.62644 1.5625 4.375 1.81394 4.375 2.125V18.4375H8.3125V15.0625H10H11.6875V18.4375H15.625Z" stroke="#87898F" strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                {/* Информация */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{proxy.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {proxy.proxy || `${proxy.server}:${proxy.port}`}
                  </div>
                </div>

                {/* Флаг и локация */}
                <div className="flex items-center gap-2">
                  <span className={`fi fi-${(proxy.countryCode || proxy.country_code || 'xx').toLowerCase()} text-2xl`}></span>
                  <div className="text-sm">
                    <div className="font-medium">{proxy.countryCode || proxy.country_code}</div>
                    {(proxy.stateName || proxy.state) && (
                      <div className="text-gray-600 dark:text-gray-400">
                        {proxy.stateName || proxy.state}
                      </div>
                    )}
                  </div>
                </div>

                {/* Действия */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRefreshIP(proxy)}
                  disabled={!proxy.refresh_link}
                  title="Обновить IP адрес"
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(proxy.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Информация */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Найдено прокси: {filteredProxies.length} из {proxies.length}
      </div>
    </div>
  );
};

export default SXOrgImportProxy;
