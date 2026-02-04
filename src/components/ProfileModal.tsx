import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Profile, Proxy } from '@/types';
import { Zap, Globe } from 'lucide-react';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (profile: Omit<Profile, 'id' | 'createdAt' | 'status'>) => void;
  profile: Profile | null;
  proxies: Proxy[];
  folders?: string[]; // Список доступных папок
  onOpenSXOrg?: () => void; // Callback для открытия SX.ORG интеграции
}

const ProfileModal = ({ open, onOpenChange, onSave, profile, proxies, folders = [], onOpenSXOrg }: ProfileModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    notes: '',
    folder: '', // Папка профиля
    userAgent: 'auto',
    screenWidth: 1920,
    screenHeight: 1080,
    language: 'ru-RU',
    timezone: 'Europe/Moscow',
    proxyEnabled: false,
    proxyType: 'http',
    proxyHost: '',
    proxyPort: '',
    proxyUsername: '',
    proxyPassword: '',
    canvasNoise: true,
    webglNoise: true,
    audioNoise: true,
    blockWebRTC: true,
    spoofGeolocation: false,
    latitude: 0,
    longitude: 0,
  });

  const [quickProxyInput, setQuickProxyInput] = useState('');
  const [proxyInputMode, setProxyInputMode] = useState<'select' | 'quick' | 'manual'>('select');

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name,
        notes: profile.notes || '',
        folder: profile.folder || '',
        userAgent: profile.userAgent,
        screenWidth: profile.screenWidth,
        screenHeight: profile.screenHeight,
        language: profile.language,
        timezone: profile.timezone,
        proxyEnabled: profile.proxy?.enabled || false,
        proxyType: profile.proxy?.type || 'http',
        proxyHost: profile.proxy?.host || '',
        proxyPort: profile.proxy?.port || '',
        proxyUsername: profile.proxy?.username || '',
        proxyPassword: profile.proxy?.password || '',
        canvasNoise: profile.antidetect.canvasNoise,
        webglNoise: profile.antidetect.webglNoise,
        audioNoise: profile.antidetect.audioNoise,
        blockWebRTC: profile.antidetect.blockWebRTC,
        spoofGeolocation: profile.antidetect.spoofGeolocation,
        latitude: profile.antidetect.geolocation?.latitude || 0,
        longitude: profile.antidetect.geolocation?.longitude || 0,
      });
    } else {
      setFormData({
        name: '',
        notes: '',
        folder: '',
        userAgent: 'auto',
        screenWidth: 1920,
        screenHeight: 1080,
        language: 'ru-RU',
        timezone: 'Europe/Moscow',
        proxyEnabled: false,
        proxyType: 'http',
        proxyHost: '',
        proxyPort: '',
        proxyUsername: '',
        proxyPassword: '',
        canvasNoise: true,
        webglNoise: true,
        audioNoise: true,
        blockWebRTC: true,
        spoofGeolocation: false,
        latitude: 0,
        longitude: 0,
      });
    }
    setQuickProxyInput('');
    setProxyInputMode('select');
  }, [profile, open]);

  const parseProxyString = (proxyString: string): Partial<typeof formData> | null => {
    try {
      const trimmed = proxyString.trim();

      // URL формат: protocol://username:password@host:port
      if (trimmed.includes('://')) {
        const url = new URL(trimmed);
        return {
          proxyEnabled: true,
          proxyType: url.protocol.replace(':', ''),
          proxyHost: url.hostname,
          proxyPort: url.port,
          proxyUsername: url.username || '',
          proxyPassword: url.password || '',
        };
      }

      // username:password@host:port
      if (trimmed.includes('@')) {
        const [auth, hostPort] = trimmed.split('@');
        const [username, password] = auth.split(':');
        const [host, port] = hostPort.split(':');

        return {
          proxyEnabled: true,
          proxyType: 'http',
          proxyHost: host,
          proxyPort: port,
          proxyUsername: username || '',
          proxyPassword: password || '',
        };
      }

      // host:port:username:password
      const parts = trimmed.split(':');
      if (parts.length === 4) {
        return {
          proxyEnabled: true,
          proxyType: 'http',
          proxyHost: parts[0],
          proxyPort: parts[1],
          proxyUsername: parts[2] || '',
          proxyPassword: parts[3] || '',
        };
      }

      // host:port
      if (parts.length === 2) {
        return {
          proxyEnabled: true,
          proxyType: 'http',
          proxyHost: parts[0],
          proxyPort: parts[1],
          proxyUsername: '',
          proxyPassword: '',
        };
      }
    } catch (error) {
      console.warn('Failed to parse proxy string:', proxyString, error);
    }
    return null;
  };

  const handleQuickProxyApply = () => {
    if (!quickProxyInput.trim()) {
      alert('Введите прокси');
      return;
    }

    const parsed = parseProxyString(quickProxyInput);
    if (!parsed) {
      alert('Не удалось распознать формат прокси. Попробуйте другой формат.');
      return;
    }

    setFormData({ ...formData, ...parsed });
    setQuickProxyInput('');
    alert('Прокси применен!');
  };

  const handleSelectProxy = (index: number) => {
    const proxy = proxies[index];
    setFormData({
      ...formData,
      proxyEnabled: true,
      proxyType: proxy.type,
      proxyHost: proxy.host,
      proxyPort: proxy.port,
      proxyUsername: proxy.username || '',
      proxyPassword: proxy.password || '',
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      alert('Введите название профиля');
      return;
    }

    onSave({
      name: formData.name,
      notes: formData.notes,
      folder: formData.folder || undefined,
      userAgent: formData.userAgent,
      screenWidth: formData.screenWidth,
      screenHeight: formData.screenHeight,
      language: formData.language,
      timezone: formData.timezone,
      proxy: formData.proxyEnabled ? {
        enabled: true,
        type: formData.proxyType as 'http' | 'https' | 'socks5' | 'socks4',
        host: formData.proxyHost.trim(),
        port: formData.proxyPort.trim(), // Оставляем как string для совместимости
        username: formData.proxyUsername.trim() || undefined,
        password: formData.proxyPassword.trim() || undefined,
      } : undefined,
      antidetect: {
        canvasNoise: formData.canvasNoise,
        webglNoise: formData.webglNoise,
        audioNoise: formData.audioNoise,
        blockWebRTC: formData.blockWebRTC,
        spoofGeolocation: formData.spoofGeolocation,
        geolocation: formData.spoofGeolocation ? {
          latitude: formData.latitude,
          longitude: formData.longitude,
        } : undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile ? 'Редактировать профиль' : 'Создать новый профиль'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Основные</TabsTrigger>
            <TabsTrigger value="browser">Браузер</TabsTrigger>
            <TabsTrigger value="proxy">Прокси</TabsTrigger>
            <TabsTrigger value="antidetect">Антидетект</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div>
              <Label htmlFor="name">Название профиля *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Мой профиль"
              />
            </div>

            <div>
              <Label htmlFor="folder">Папка</Label>
              <Select
                value={formData.folder}
                onValueChange={(value) => setFormData({ ...formData, folder: value === '_none_' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без папки" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">Без папки</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder} value={folder}>{folder}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Заметки</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Дополнительная информация о профиле"
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="browser" className="space-y-4">
            <div>
              <Label htmlFor="userAgent">User Agent</Label>
              <Select value={formData.userAgent} onValueChange={(value) => setFormData({ ...formData, userAgent: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Автоматический</SelectItem>
                  <SelectItem value="chrome_win">Chrome Windows</SelectItem>
                  <SelectItem value="chrome_mac">Chrome macOS</SelectItem>
                  <SelectItem value="firefox_win">Firefox Windows</SelectItem>
                  <SelectItem value="firefox_mac">Firefox macOS</SelectItem>
                  <SelectItem value="safari_mac">Safari macOS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="screenWidth">Ширина экрана</Label>
                <Input
                  id="screenWidth"
                  type="number"
                  value={formData.screenWidth}
                  onChange={(e) => setFormData({ ...formData, screenWidth: parseInt(e.target.value) || 1920 })}
                  min={800}
                  max={3840}
                />
              </div>
              <div>
                <Label htmlFor="screenHeight">Высота экрана</Label>
                <Input
                  id="screenHeight"
                  type="number"
                  value={formData.screenHeight}
                  onChange={(e) => setFormData({ ...formData, screenHeight: parseInt(e.target.value) || 1080 })}
                  min={600}
                  max={2160}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="language">Язык</Label>
                <Select value={formData.language} onValueChange={(value) => setFormData({ ...formData, language: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru-RU">Русский</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="de-DE">Deutsch</SelectItem>
                    <SelectItem value="fr-FR">Français</SelectItem>
                    <SelectItem value="es-ES">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="timezone">Часовой пояс</Label>
                <Select value={formData.timezone} onValueChange={(value) => setFormData({ ...formData, timezone: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Moscow">Москва (UTC+3)</SelectItem>
                    <SelectItem value="Europe/London">Лондон (UTC+0)</SelectItem>
                    <SelectItem value="America/New_York">Нью-Йорк (UTC-5)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Лос-Анджелес (UTC-8)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Токио (UTC+9)</SelectItem>
                    <SelectItem value="Asia/Shanghai">Шанхай (UTC+8)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="proxy" className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="proxyEnabled"
                checked={formData.proxyEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, proxyEnabled: checked as boolean })}
              />
              <Label htmlFor="proxyEnabled">Использовать прокси</Label>
            </div>

            {formData.proxyEnabled && (
              <>
                {/* Режим выбора прокси */}
                <div className="flex gap-2 mb-4">
                  <Button
                    type="button"
                    size="sm"
                    variant={proxyInputMode === 'select' ? 'default' : 'outline'}
                    onClick={() => setProxyInputMode('select')}
                  >
                    Выбрать из списка
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={proxyInputMode === 'quick' ? 'default' : 'outline'}
                    onClick={() => setProxyInputMode('quick')}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Быстрый ввод
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={proxyInputMode === 'manual' ? 'default' : 'outline'}
                    onClick={() => setProxyInputMode('manual')}
                  >
                    Ручной ввод
                  </Button>
                  {onOpenSXOrg && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onOpenSXOrg}
                      className="bg-blue-100 border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-200 px-3 py-2"
                    >
                      <img src="/src/assets/sxorg-logo.svg" alt="SX.ORG" className="h-4 w-auto" style={{ minWidth: '48px' }} />
                    </Button>
                  )}
                </div>

                {/* Выбор из списка */}
                {proxyInputMode === 'select' && (
                  <div>
                    <Label>Выберите прокси из списка</Label>
                    {proxies.length === 0 ? (
                      <div className="text-sm text-gray-600 p-4 bg-gray-50 rounded-lg">
                        Нет сохраненных прокси. Добавьте прокси в разделе "Прокси" или используйте быстрый ввод.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                        {proxies.map((proxy, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleSelectProxy(index)}
                            className="w-full text-left p-3 hover:bg-blue-50 rounded-lg border border-gray-200 transition-colors"
                          >
                            <div className="font-semibold text-sm">
                              {proxy.type.toUpperCase()}://{proxy.host}:{proxy.port}
                            </div>
                            <div className="text-xs text-gray-600">
                              {proxy.username ? `${proxy.username}:***` : 'Без авторизации'}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Быстрый ввод */}
                {proxyInputMode === 'quick' && (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="quickProxy">Вставьте прокси в любом формате</Label>
                      <div className="flex gap-2">
                        <Input
                          id="quickProxy"
                          value={quickProxyInput}
                          onChange={(e) => setQuickProxyInput(e.target.value)}
                          placeholder="socks5://user:pass@127.0.0.1:1080"
                          className="font-mono"
                        />
                        <Button type="button" onClick={handleQuickProxyApply}>
                          Применить
                        </Button>
                      </div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg text-sm">
                      <p className="font-semibold mb-1">✨ Поддерживаемые форматы:</p>
                      <ul className="text-xs space-y-1 text-gray-700">
                        <li>• protocol://username:password@host:port</li>
                        <li>• username:password@host:port</li>
                        <li>• host:port:username:password</li>
                        <li>• protocol://host:port</li>
                        <li>• host:port</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Ручной ввод */}
                {proxyInputMode === 'manual' && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="proxyType">Тип</Label>
                        <Select value={formData.proxyType} onValueChange={(value) => setFormData({ ...formData, proxyType: value })}>
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
                        <Label htmlFor="proxyHost">Хост</Label>
                        <Input
                          id="proxyHost"
                          value={formData.proxyHost}
                          onChange={(e) => setFormData({ ...formData, proxyHost: e.target.value })}
                          placeholder="127.0.0.1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="proxyPort">Порт</Label>
                        <Input
                          id="proxyPort"
                          value={formData.proxyPort}
                          onChange={(e) => setFormData({ ...formData, proxyPort: e.target.value })}
                          placeholder="1080"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="proxyUsername">Логин</Label>
                        <Input
                          id="proxyUsername"
                          value={formData.proxyUsername}
                          onChange={(e) => setFormData({ ...formData, proxyUsername: e.target.value })}
                          placeholder="username"
                        />
                      </div>
                      <div>
                        <Label htmlFor="proxyPassword">Пароль</Label>
                        <Input
                          id="proxyPassword"
                          type="password"
                          value={formData.proxyPassword}
                          onChange={(e) => setFormData({ ...formData, proxyPassword: e.target.value })}
                          placeholder="password"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Текущие настройки прокси */}
                {formData.proxyHost && formData.proxyPort && (
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                    <p className="text-sm font-semibold text-green-800 mb-1">✅ Текущий прокси:</p>
                    <p className="text-sm text-green-700 font-mono">
                      {formData.proxyType.toUpperCase()}://{formData.proxyHost}:{formData.proxyPort}
                      {formData.proxyUsername && ` (${formData.proxyUsername})`}
                    </p>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="antidetect" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="canvasNoise"
                  checked={formData.canvasNoise}
                  onCheckedChange={(checked) => setFormData({ ...formData, canvasNoise: checked as boolean })}
                />
                <Label htmlFor="canvasNoise">Canvas шум (защита от Canvas fingerprinting)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="webglNoise"
                  checked={formData.webglNoise}
                  onCheckedChange={(checked) => setFormData({ ...formData, webglNoise: checked as boolean })}
                />
                <Label htmlFor="webglNoise">WebGL шум (защита от WebGL fingerprinting)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="audioNoise"
                  checked={formData.audioNoise}
                  onCheckedChange={(checked) => setFormData({ ...formData, audioNoise: checked as boolean })}
                />
                <Label htmlFor="audioNoise">Audio шум (защита от Audio fingerprinting)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="blockWebRTC"
                  checked={formData.blockWebRTC}
                  onCheckedChange={(checked) => setFormData({ ...formData, blockWebRTC: checked as boolean })}
                />
                <Label htmlFor="blockWebRTC">Блокировать WebRTC (скрытие реального IP)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="spoofGeolocation"
                  checked={formData.spoofGeolocation}
                  onCheckedChange={(checked) => setFormData({ ...formData, spoofGeolocation: checked as boolean })}
                />
                <Label htmlFor="spoofGeolocation">Подмена геолокации</Label>
              </div>

              {formData.spoofGeolocation && (
                <div className="grid grid-cols-2 gap-4 ml-6">
                  <div>
                    <Label htmlFor="latitude">Широта</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="0.000001"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                      placeholder="55.7558"
                    />
                  </div>
                  <div>
                    <Label htmlFor="longitude">Долгота</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="0.000001"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                      placeholder="37.6176"
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit}>
            Сохранить профиль
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal;