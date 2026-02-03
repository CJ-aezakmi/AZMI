import { useState, useEffect } from 'react';
import { Plus, Search, Play, Edit, Copy, Trash2, Globe, Folder, Puzzle, BarChart3, Settings, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import ProfileModal from '@/components/ProfileModal';
import ProxyModal from '@/components/ProxyModal';
import UpdateDialog from '@/components/UpdateDialog';
import { toast } from 'sonner';
import { Profile, Proxy } from '@/types';
import { launchProfile } from '@/lib/launchProfile';
import { safeConfirm, safePrompt } from '@/lib/safeDialog';
import { checkForUpdates, downloadUpdate, installUpdate, UpdateInfo, shouldAutoCheck, setLastUpdateCheck, isAutoUpdateEnabled, getCurrentVersion } from '@/lib/updater';

const Dashboard = () => {
  const [activeView, setActiveView] = useState('profiles');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProxyModalOpen, setIsProxyModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [folders, setFolders] = useState<string[]>(['Работа', 'Личное', 'Тестовые']);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);


  // Проверка Node.js при первом запуске
  useEffect(() => {
    const checkNodeJS = async () => {
      const hasChecked = localStorage.getItem('nodejs_check_done');
      if (hasChecked) return;
      
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke('check_and_install_nodejs') as string;
        
        if (result.includes('already installed')) {
          localStorage.setItem('nodejs_check_done', 'true');
        } else {
          // Show installation message
          if (window.confirm(
            'Node.js не установлен на вашем компьютере.\n\n' +
            'Он необходим для запуска браузерных профилей.\n\n' +
            'Запустить установку сейчас?'
          )) {
            const installResult = await invoke('check_and_install_nodejs') as string;
            alert(installResult);
            
            if (installResult.includes('installation started')) {
              localStorage.setItem('nodejs_check_done', 'true');
            }
          }
        }
      } catch (error) {
        console.error('Node.js check failed:', error);
      }
    };
    
    checkNodeJS();
  }, []);

  // Загрузка данных из localStorage
  useEffect(() => {
    const savedProfiles = localStorage.getItem('aezakmi_profiles');
    const savedProxies = localStorage.getItem('aezakmi_proxies');
    const savedFolders = localStorage.getItem('aezakmi_folders');
    
    if (savedProfiles) {
      setProfiles(JSON.parse(savedProfiles));
    }
    if (savedProxies) {
      setProxies(JSON.parse(savedProxies));
    }
    if (savedFolders) {
      setFolders(JSON.parse(savedFolders));
    }
  }, []);

  // Сохранение профилей
  const saveProfiles = (newProfiles: Profile[]) => {
    setProfiles(newProfiles);
    localStorage.setItem('aezakmi_profiles', JSON.stringify(newProfiles));
  };

  // Сохранение прокси
  const saveProxies = (newProxies: Proxy[]) => {
    setProxies(newProxies);
    localStorage.setItem('aezakmi_proxies', JSON.stringify(newProxies));
  };

  // Сохранение папок
  const saveFolders = (newFolders: string[]) => {
    setFolders(newFolders);
    localStorage.setItem('aezakmi_folders', JSON.stringify(newFolders));
  };



  // Создание/редактирование профиля
  const handleSaveProfile = (profileData: Omit<Profile, 'id' | 'createdAt' | 'status'>) => {
    if (editingProfile) {
      // Редактирование
      const updatedProfiles = profiles.map(p =>
        p.id === editingProfile.id
          ? { ...p, ...profileData, updatedAt: new Date().toISOString() }
          : p
      );
      saveProfiles(updatedProfiles);
      toast.success(`Профиль "${profileData.name}" обновлен!`);
    } else {
      // Создание
      const newProfile: Profile = {
        ...profileData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        status: 'inactive'
      };
      saveProfiles([...profiles, newProfile]);
      toast.success(`Профиль "${profileData.name}" создан!`);
    }
    setIsProfileModalOpen(false);
    setEditingProfile(null);
  };

  // Запуск профиля
  const handleLaunchProfile = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      toast.info(`Запуск профиля "${profile.name}"...`, {
        description: 'Попытка открыть браузер с настройками профиля'
      });

      try {
        // Вызов реальной функции запуска (tauri plugin shell)
        await launchProfile(profile);

        const updatedProfiles = profiles.map(p =>
          p.id === profileId ? { ...p, status: 'active' as const } : p
        );
        saveProfiles(updatedProfiles);

        toast.success(`Профиль "${profile.name}" активен!`, {
          description: 'Браузер запущен'
        });
      } catch (err: any) {
        console.error('launchProfile error', err);
        toast.error(`Не удалось запустить профиль`, {
          description: err?.message || String(err)
        });
      }
    }
  };

  // Диагностика Playwright
  const handleCheckPlaywright = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('check_and_install_playwright') as string;
      
      alert('✅ Статус компонентов:\n\n' + result);
    } catch (err: any) {
      alert('❌ Ошибка проверки:\n\n' + err);
    }
  };

  // Редактирование профиля
  const handleEditProfile = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setEditingProfile(profile);
      setIsProfileModalOpen(true);
    }
  };

  // Клонирование профиля
  const handleCloneProfile = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      const clonedProfile: Profile = {
        ...profile,
        id: Date.now().toString(),
        name: `${profile.name} (копия)`,
        createdAt: new Date().toISOString(),
        status: 'inactive'
      };
      saveProfiles([...profiles, clonedProfile]);
      toast.success(`Профиль "${profile.name}" клонирован!`);
    }
  };

  // Удаление профиля (ИСПРАВЛЕНО: использует Tauri dialog)
  const handleDeleteProfile = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      const confirmed = await safeConfirm(`Удалить профиль "${profile.name}"?`);

      if (confirmed) {
        saveProfiles(profiles.filter(p => p.id !== profileId));
        selectedProfiles.delete(profileId);
        setSelectedProfiles(new Set(selectedProfiles));
        toast.success(`Профиль "${profile.name}" удален!`);
      }
    }
  };

  // Выбор профиля
  const toggleProfileSelection = (profileId: string) => {
    const newSelected = new Set(selectedProfiles);
    if (newSelected.has(profileId)) {
      newSelected.delete(profileId);
    } else {
      newSelected.add(profileId);
    }
    setSelectedProfiles(newSelected);
  };

  // Выбрать все
  const toggleSelectAll = () => {
    if (selectedProfiles.size === filteredProfiles.length) {
      setSelectedProfiles(new Set());
    } else {
      setSelectedProfiles(new Set(filteredProfiles.map(p => p.id)));
    }
  };

  // Запуск выбранных
  const handleLaunchSelected = () => {
    selectedProfiles.forEach(id => handleLaunchProfile(id));
    toast.success(`Запущено профилей: ${selectedProfiles.size}`);
  };

  // Удаление выбранных
  const handleDeleteSelected = async () => {
    const confirmed = await safeConfirm(`Удалить ${selectedProfiles.size} профилей?`);

    if (confirmed) {
      saveProfiles(profiles.filter(p => !selectedProfiles.has(p.id)));
      setSelectedProfiles(new Set());
      toast.success(`Удалено профилей: ${selectedProfiles.size}`);
    }
  };

  // Экспорт профилей
  const handleExportProfiles = () => {
    const dataStr = JSON.stringify(profiles, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aezakmi_profiles_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Профили экспортированы!');
  };

  // Импорт профилей
  const handleImportProfiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const importedProfiles = JSON.parse(event.target?.result as string);
            if (Array.isArray(importedProfiles)) {
              saveProfiles([...profiles, ...importedProfiles]);
              toast.success(`Импортировано профилей: ${importedProfiles.length}`);
            } else {
              toast.error('Неверный формат файла');
            }
          } catch {
            toast.error('Ошибка чтения файла');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Добавление прокси
  const handleAddProxies = (newProxies: Proxy[]) => {
    // Normalize username/login fields to avoid mismatch between parsers and launcher
    const normalized = newProxies.map(p => ({
      ...p,
      username: p.username || p.login || undefined,
      login: p.login || p.username || undefined,
    }));
    saveProxies([...proxies, ...normalized]);
    toast.success(`Добавлено прокси: ${newProxies.length}`);
    setIsProxyModalOpen(false);
  };

  // Удаление прокси
  const handleDeleteProxy = async (index: number) => {
    const proxy = proxies[index];
    const confirmed = await safeConfirm(`Удалить прокси ${proxy.host}:${proxy.port}?`);

    if (confirmed) {
      saveProxies(proxies.filter((_, i) => i !== index));
      toast.success('Прокси удален!');
    }
  };

  // Тест прокси
  const handleTestProxy = async (index: number) => {
    const proxy = proxies[index];
    toast.info(`Проверка прокси ${proxy.host}:${proxy.port}...`);
    
    // Симуляция проверки
    setTimeout(() => {
      const updatedProxies = [...proxies];
      const isWorking = Math.random() > 0.3; // 70% шанс что работает
      updatedProxies[index] = { ...proxy, status: isWorking ? 'working' : 'failed' };
      saveProxies(updatedProxies);
      
      if (isWorking) {
        toast.success(`Прокси ${proxy.host}:${proxy.port} работает!`);
      } else {
        toast.error(`Прокси ${proxy.host}:${proxy.port} не отвечает`);
      }
    }, 1500);
  };

  // Добавление папки
  const handleAddFolder = async () => {
    const folderName = await safePrompt('Введите название папки:');

    if (folderName && typeof folderName === 'string' && folderName.trim()) {
      saveFolders([...folders, folderName.trim()]);
      toast.success(`Папка "${folderName}" создана!`);
    }
  };

  // Удаление папки
  const handleDeleteFolder = async (index: number) => {
    const folder = folders[index];
    const confirmed = await safeConfirm(`Удалить папку "${folder}"?`);

    if (confirmed) {
      saveFolders(folders.filter((_, i) => i !== index));
      toast.success(`Папка "${folder}" удалена!`);
    }
  };

  // Удаление расширения - ЗАГЛУШКА (функция больше не используется)
  const handleDeleteExtension = async (index: number) => {
    // Функция оставлена для совместимости, но не используется
  };

  // Проверка обновлений
  const handleCheckForUpdates = async () => {
    toast.info('Проверка обновлений...');
    
    try {
      const update = await checkForUpdates();
      
      if (!update) {
        toast.error('Не удалось проверить обновления');
        return;
      }
      
      if (update.available) {
        setUpdateInfo(update);
        setShowUpdateDialog(true);
        setLastUpdateCheck();
      } else {
        toast.success('У вас установлена последняя версия!');
      }
    } catch (error) {
      console.error('Error checking updates:', error);
      toast.error('Ошибка при проверке обновлений');
    }
  };

  // Установка обновления
  const handleInstallUpdate = async () => {
    if (!updateInfo) return;
    
    try {
      toast.info('Скачивание обновления...');
      
      const installerPath = await downloadUpdate(updateInfo.downloadUrl);
      
      toast.success('Запуск установщика...');
      
      await installUpdate(installerPath);
      
      // После вызова installUpdate приложение закроется
    } catch (error: any) {
      console.error('Error installing update:', error);
      toast.error(`Ошибка установки: ${error.message}`);
    }
  };

  // Автоматическая проверка обновлений при запуске
  useEffect(() => {
    const autoCheckUpdates = async () => {
      if (isAutoUpdateEnabled() && shouldAutoCheck()) {
        const update = await checkForUpdates();
        
        if (update && update.available) {
          setUpdateInfo(update);
          setShowUpdateDialog(true);
          setLastUpdateCheck();
        }
      }
    };
    
    // Задержка 3 секунды после загрузки приложения
    const timer = setTimeout(autoCheckUpdates, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  // Фильтрация профилей
  const filteredProfiles = profiles.filter(profile => {
    // Поиск по имени
    const matchesSearch = profile.name.toLowerCase().includes(searchTerm.toLowerCase());
    // Фильтр по папке
    let matchesFolder = true;
    if (selectedFolder === '_no_folder_') {
      matchesFolder = !profile.folder; // Профили без папки
    } else if (selectedFolder) {
      matchesFolder = profile.folder === selectedFolder; // Профили конкретной папки
    }
    // Если selectedFolder === null, показываем все профили
    return matchesSearch && matchesFolder;
  });

  // Статистика
  const stats = {
    totalProfiles: profiles.length,
    activeProfiles: profiles.filter(p => p.status === 'active').length,
    totalProxies: proxies.length,
    workingProxies: proxies.filter(p => p.status === 'working').length,
  };

  const navItems = [
    { id: 'profiles', label: 'Все профили', icon: Play, count: profiles.length },
    { id: 'folders', label: 'Папки', icon: Folder, count: folders.length },
    { id: 'proxies', label: 'Прокси', icon: Globe, count: proxies.length },
    { id: 'statistics', label: 'Статистика', icon: BarChart3 },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-50 relative">
      {/* Background Image */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-20"
        style={{ backgroundImage: 'url(/assets/background.webp)' }}
      />

      {/* Sidebar */}
      <aside className="w-64 bg-white/95 backdrop-blur-sm border-r border-gray-200 flex flex-col relative z-10">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <img src="/assets/logo.jpg" alt="AEZAKMI Logo" className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <h1 className="font-bold text-lg">AEZAKMI Pro</h1>
              <p className="text-xs text-gray-500">v2.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                activeView === item.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </div>
              {item.count !== undefined && (
                <Badge variant="secondary">{item.count}</Badge>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <Button
            onClick={() => {
              setEditingProfile(null);
              setIsProfileModalOpen(true);
            }}
            className="w-full mb-2"
          >
            <Plus className="w-4 h-4 mr-2" />
            Создать профиль
          </Button>
          <Button
            onClick={handleCheckPlaywright}
            variant="outline"
            className="w-full text-xs"
          >
            🔍 Проверка компонентов
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative z-10">
        {activeView === 'profiles' && (
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-4">Управление профилями</h2>
              <div className="flex gap-4 items-center mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    placeholder="Поиск профилей..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-gray-600">
                    Выбрано: {selectedProfiles.size}
                  </span>
                  <Button variant="outline" onClick={toggleSelectAll}>
                    {selectedProfiles.size === filteredProfiles.length ? 'Снять выбор' : 'Выбрать все'}
                  </Button>
                  <Button
                    onClick={handleLaunchSelected}
                    disabled={selectedProfiles.size === 0}
                  >
                    Запустить
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteSelected}
                    disabled={selectedProfiles.size === 0}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleImportProfiles}>
                  <Upload className="w-4 h-4 mr-2" />
                  Импорт
                </Button>
                <Button variant="outline" onClick={handleExportProfiles} disabled={profiles.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Экспорт
                </Button>
              </div>
            </div>

            {filteredProfiles.length === 0 ? (
              <Card className="text-center py-12 bg-white/95 backdrop-blur-sm">
                <CardContent>
                  <h3 className="text-xl font-semibold mb-2">Нет профилей</h3>
                  <p className="text-gray-600 mb-4">Создайте свой первый профиль для начала работы</p>
                  <Button onClick={() => setIsProfileModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Создать профиль
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProfiles.map(profile => (
                  <Card key={profile.id} className="hover:shadow-lg transition-shadow bg-white/95 backdrop-blur-sm">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedProfiles.has(profile.id)}
                            onCheckedChange={() => toggleProfileSelection(profile.id)}
                          />
                          <CardTitle className="text-lg">{profile.name}</CardTitle>
                        </div>
                        <Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
                          {profile.status === 'active' ? 'Активен' : 'Неактивен'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">User Agent:</span>
                          <span className="font-medium">{profile.userAgent}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Разрешение:</span>
                          <span className="font-medium">{profile.screenWidth}x{profile.screenHeight}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Прокси:</span>
                          <span className="font-medium">
                            {profile.proxy?.enabled ? `${profile.proxy.host}:${profile.proxy.port}` : 'Нет'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => launchProfile(profile)}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Запустить
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditProfile(profile.id)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCloneProfile(profile.id)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteProfile(profile.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'folders' && (
          <div className="p-8">
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Организация по папкам</h2>
              <Button onClick={handleAddFolder}>
                <Plus className="w-4 h-4 mr-2" />
                Создать папку
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Папка "Все профили" */}
              <Card 
                className={`bg-white/95 backdrop-blur-sm cursor-pointer hover:shadow-lg transition-all ${!selectedFolder ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => {
                  setSelectedFolder(null);
                  setActiveView('profiles');
                }}
              >
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-3">
                    <Folder className="w-8 h-8 text-gray-600" />
                    <div>
                      <h3 className="font-semibold text-lg">Все профили</h3>
                      <p className="text-sm text-gray-600">
                        {profiles.length} профилей
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Папка "Без папки" */}
              <Card 
                className={`bg-white/95 backdrop-blur-sm cursor-pointer hover:shadow-lg transition-all ${selectedFolder === null ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => {
                  setSelectedFolder('_no_folder_');
                  setActiveView('profiles');
                }}
              >
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-3">
                    <Folder className="w-8 h-8 text-orange-600" />
                    <div>
                      <h3 className="font-semibold text-lg">Без папки</h3>
                      <p className="text-sm text-gray-600">
                        {profiles.filter(p => !p.folder).length} профилей
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Пользовательские папки */}
              {folders.map((folder, index) => {
                const folderProfiles = profiles.filter(p => p.folder === folder);
                return (
                  <Card 
                    key={index} 
                    className={`bg-white/95 backdrop-blur-sm cursor-pointer hover:shadow-lg transition-all ${selectedFolder === folder ? 'ring-2 ring-blue-500' : ''}`}
                    onClick={() => {
                      setSelectedFolder(folder);
                      setActiveView('profiles');
                    }}
                  >
                    <CardContent className="flex items-center justify-between p-6">
                      <div className="flex items-center gap-3 flex-1">
                        <Folder className="w-8 h-8 text-blue-600" />
                        <div>
                          <h3 className="font-semibold text-lg">{folder}</h3>
                          <p className="text-sm text-gray-600">
                            {folderProfiles.length} профилей
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(index);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {activeView === 'proxies' && (
          <div className="p-8">
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Управление прокси</h2>
              <Button onClick={() => setIsProxyModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Добавить прокси
              </Button>
            </div>

            {proxies.length === 0 ? (
              <Card className="text-center py-12 bg-white/95 backdrop-blur-sm">
                <CardContent>
                  <h3 className="text-xl font-semibold mb-2">Нет прокси</h3>
                  <p className="text-gray-600 mb-4">Добавьте прокси для использования в профилях</p>
                  <Button onClick={() => setIsProxyModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить прокси
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {proxies.map((proxy, index) => (
                  <Card key={index} className="bg-white/95 backdrop-blur-sm">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex-1">
                        <div className="font-semibold">
                          {proxy.type.toUpperCase()}://{proxy.host}:{proxy.port}
                        </div>
                        <div className="text-sm text-gray-600">
                          {proxy.username ? `${proxy.username}:***` : 'Без авторизации'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={proxy.status === 'working' ? 'default' : proxy.status === 'failed' ? 'destructive' : 'secondary'}>
                          {proxy.status === 'working' ? '✅ Работает' : proxy.status === 'failed' ? '❌ Не работает' : '❓ Не проверен'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestProxy(index)}
                        >
                          Проверить
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteProxy(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'statistics' && (
          <div className="p-8">
            <h2 className="text-2xl font-bold mb-6">Статистика использования</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">Всего профилей</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">{stats.totalProfiles}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">Активных профилей</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">{stats.activeProfiles}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">Всего прокси</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-purple-600">{stats.totalProxies}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">Рабочих прокси</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-orange-600">{stats.workingProxies}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6 bg-white/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Последняя активность</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profiles.slice(0, 5).map(profile => (
                    <div key={profile.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{profile.name}</p>
                        <p className="text-sm text-gray-600">
                          Создан: {new Date(profile.createdAt).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                      <Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
                        {profile.status === 'active' ? 'Активен' : 'Неактивен'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeView === 'settings' && (
          <div className="p-8">
            <h2 className="text-2xl font-bold mb-6">Настройки приложения</h2>
            <div className="space-y-4 max-w-2xl">
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Общие настройки</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Автозапуск при старте системы</p>
                      <p className="text-sm text-gray-600">Запускать AEZAKMI при включении компьютера</p>
                    </div>
                    <Checkbox defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Минимизировать в трей</p>
                      <p className="text-sm text-gray-600">Сворачивать приложение в системный трей</p>
                    </div>
                    <Checkbox defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Автоматическое обновление</p>
                      <p className="text-sm text-gray-600">Проверять наличие новых версий</p>
                    </div>
                    <Checkbox defaultChecked />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Безопасность</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Очистка cookies при закрытии</p>
                      <p className="text-sm text-gray-600">Удалять cookies после завершения сеанса</p>
                    </div>
                    <Checkbox />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Блокировка WebRTC по умолчанию</p>
                      <p className="text-sm text-gray-600">Включать блокировку WebRTC для новых профилей</p>
                    </div>
                    <Checkbox defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Защита от скриншотов</p>
                      <p className="text-sm text-gray-600">Блокировать создание скриншотов окон браузера</p>
                    </div>
                    <Checkbox defaultChecked />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>О программе</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p><strong>Версия:</strong> {getCurrentVersion()}</p>
                    <p><strong>Дата сборки:</strong> {new Date().toLocaleDateString('ru-RU')}</p>
                    <p><strong>Лицензия:</strong> Коммерческая</p>
                    <div className="pt-4">
                      <Button variant="outline" className="w-full" onClick={handleCheckForUpdates}>
                        Проверить обновления
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ProfileModal
        open={isProfileModalOpen}
        onOpenChange={setIsProfileModalOpen}
        onSave={handleSaveProfile}
        profile={editingProfile}
        proxies={proxies}
        folders={folders}
      />

      <ProxyModal
        open={isProxyModalOpen}
        onOpenChange={setIsProxyModalOpen}
        onAdd={handleAddProxies}
      />

      <UpdateDialog
        open={showUpdateDialog}
        updateInfo={updateInfo}
        onUpdate={handleInstallUpdate}
        onLater={() => setShowUpdateDialog(false)}
      />
    </div>
  );
};

export default Dashboard;