import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Proxy } from '@/types';

interface ProxyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (proxies: Proxy[]) => void;
}

const ProxyModal = ({ open, onOpenChange, onAdd }: ProxyModalProps) => {
  const [proxyText, setProxyText] = useState('');
  const [quickProxyInput, setQuickProxyInput] = useState('');
  
  // Ручной ввод
  const [manualType, setManualType] = useState<Proxy['type']>('http');
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [manualPassword, setManualPassword] = useState('');

  const parseProxyLine = (line: string): Proxy | null => {
    try {
      line = line.trim();
      
      // URL формат: protocol://username:password@host:port
      if (line.includes('://')) {
        const url = new URL(line);
        return {
          type: (url.protocol.replace(':', '') as any) || 'http',
          host: url.hostname,
          port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
          login: url.username || undefined,
          username: url.username || undefined,
          password: url.password || undefined,
          enabled: true,
        } as Proxy;
      }

      // Формат: type://host:port:username:password
      const parts = line.split(':');
      
      // host:port:username:password (4 части)
      if (parts.length === 4) {
        return {
          type: 'http',
          host: parts[0],
          port: Number(parts[1]) || 80,
          login: parts[2] || undefined,
          username: parts[2] || undefined,
          password: parts[3] || undefined,
          enabled: true,
        } as Proxy;
      }
      
      // host:port (2 части)
      if (parts.length === 2) {
        return {
          type: 'http',
          host: parts[0],
          port: Number(parts[1]) || 80,
          enabled: true,
        } as Proxy;
      }

      // username:password@host:port
      if (line.includes('@')) {
        const [auth, hostPort] = line.split('@');
        const [username, password] = auth.split(':');
        const [host, port] = hostPort.split(':');

        return {
          type: 'http',
          host,
          port: Number(port) || 80,
          login: username || undefined,
          username: username || undefined,
          password: password || undefined,
          enabled: true,
        } as Proxy;
      }

      // type://host:port
      if (line.includes('//')) {
        const [type, rest] = line.split('//');
        const [host, port] = rest.split(':');
        return {
          type: (type.replace(':', '') as any) || 'http',
          host,
          port: Number(port) || (type === 'https:' ? 443 : 80),
          enabled: true,
        } as Proxy;
      }
    } catch (error) {
      // Failed to parse proxy line
    }
    return null;
  };

  const handleBulkSubmit = () => {
    const lines = proxyText.split('\n').map(line => line.trim()).filter(line => line);
    const proxies: Proxy[] = [];

    for (const line of lines) {
      const proxy = parseProxyLine(line);
      if (proxy) {
        proxies.push(proxy);
      }
    }

    if (proxies.length === 0) {
      alert('Не удалось распознать ни одного прокси');
      return;
    }

    onAdd(proxies);
    setProxyText('');
  };

  const handleQuickSubmit = () => {
    if (!quickProxyInput.trim()) {
      alert('Введите прокси');
      return;
    }

    const proxy = parseProxyLine(quickProxyInput);
    if (!proxy) {
      alert('Не удалось распознать формат прокси. Попробуйте другой формат.');
      return;
    }

    onAdd([proxy]);
    setQuickProxyInput('');
  };

  // Для предпросмотра распарсенного прокси в UI
  const quickPreview = parseProxyLine(quickProxyInput || '');

  const handleManualSubmit = () => {
    if (!manualHost || !manualPort) {
      alert('Заполните хост и порт');
      return;
    }

    const proxy: Proxy = {
      type: manualType,
      host: manualHost,
      port: Number(manualPort),
      login: manualUsername || undefined,
      password: manualPassword || undefined,
      enabled: true,
    };

    onAdd([proxy]);
    
    // Очистка формы
    setManualHost('');
    setManualPort('');
    setManualUsername('');
    setManualPassword('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Добавить прокси</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="quick" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="quick">Быстрый ввод</TabsTrigger>
            <TabsTrigger value="bulk">Массовый ввод</TabsTrigger>
            <TabsTrigger value="manual">Ручной ввод</TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="space-y-4">
            <div>
              <Label htmlFor="quickProxy">Вставьте прокси в любом формате</Label>
              <Input
                id="quickProxy"
                value={quickProxyInput}
                onChange={(e) => setQuickProxyInput(e.target.value)}
                placeholder="Например: socks5://user:pass@127.0.0.1:1080"
                className="font-mono"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="font-semibold text-sm mb-2">✨ Автоматическое распознавание форматов:</p>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• <code>protocol://username:password@host:port</code></li>
                <li>• <code>username:password@host:port</code></li>
                <li>• <code>host:port:username:password</code></li>
                <li>• <code>protocol://host:port</code></li>
                <li>• <code>host:port</code></li>
              </ul>
              <p className="text-sm mt-2 text-gray-600">
                Поддерживаемые протоколы: <strong>http, https, socks4, socks5</strong>
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="font-semibold text-sm mb-2">Примеры:</p>
              <ul className="text-sm space-y-1 font-mono text-gray-700">
                <li>socks5://user:pass@127.0.0.1:1080</li>
                <li>http://192.168.1.1:8080</li>
                <li>proxy.example.com:3128</li>
                <li>192.168.1.1:8080:admin:password</li>
              </ul>
            </div>

            {/* Preview parsed proxy for quick input */}
            <div className="mt-4">
              <Label>Предпросмотр распарсенного прокси</Label>
              {quickPreview ? (
                <div className="mt-2 p-3 border rounded bg-white text-sm font-mono text-gray-800">
                  <div><strong>Тип:</strong> {quickPreview.type}</div>
                  <div><strong>Хост:</strong> {quickPreview.host}</div>
                  <div><strong>Порт:</strong> {quickPreview.port}</div>
                  <div><strong>Логин:</strong> {quickPreview.username ?? quickPreview.login ?? '-'}</div>
                  <div><strong>Пароль:</strong> {quickPreview.password ?? '-'}</div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-500">Ни одного валидного прокси в поле быстрого ввода</div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={handleQuickSubmit}>
                Добавить прокси
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div>
              <Label htmlFor="proxyList">Список прокси (по одному на строку)</Label>
              <Textarea
                id="proxyList"
                value={proxyText}
                onChange={(e) => setProxyText(e.target.value)}
                placeholder="Вставьте список прокси в любом формате&#10;socks5://user:pass@127.0.0.1:1080&#10;http://192.168.1.1:8080&#10;proxy.example.com:3128&#10;192.168.1.1:8080:admin:password"
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            <div className="text-sm text-gray-600 space-y-1">
              <p className="font-semibold">Поддерживаемые форматы:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>protocol://username:password@host:port</li>
                <li>username:password@host:port</li>
                <li>host:port:username:password</li>
                <li>protocol://host:port</li>
                <li>host:port</li>
              </ul>
              <p className="mt-2">Поддерживаемые протоколы: http, https, socks4, socks5</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={handleBulkSubmit}>
                Добавить все прокси
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="manualType">Тип протокола</Label>
                <Select value={manualType} onValueChange={(v) => setManualType(v as Proxy['type'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                    <SelectItem value="socks4">SOCKS4</SelectItem>
                    <SelectItem value="socks5">SOCKS5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="manualHost">Хост / IP адрес *</Label>
                <Input
                  id="manualHost"
                  value={manualHost}
                  onChange={(e) => setManualHost(e.target.value)}
                  placeholder="127.0.0.1"
                />
              </div>
              <div>
                <Label htmlFor="manualPort">Порт *</Label>
                <Input
                  id="manualPort"
                  value={manualPort}
                  onChange={(e) => setManualPort(e.target.value)}
                  placeholder="1080"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="manualUsername">Логин (опционально)</Label>
                <Input
                  id="manualUsername"
                  value={manualUsername}
                  onChange={(e) => setManualUsername(e.target.value)}
                  placeholder="username"
                />
              </div>
              <div>
                <Label htmlFor="manualPassword">Пароль (опционально)</Label>
                <Input
                  id="manualPassword"
                  type="password"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  placeholder="password"
                />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
              <p>Заполните обязательные поля (отмечены *). Логин и пароль нужны только если прокси требует авторизацию.</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={handleManualSubmit}>
                Добавить прокси
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ProxyModal;