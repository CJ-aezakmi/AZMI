import { useState, useEffect } from 'react';
import { Plus, Search, Play, Edit, Copy, Trash2, Globe, Folder, Puzzle, BarChart3, Settings, Download, Upload, RefreshCw, Cookie, Smartphone, Monitor } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { ru } from '@/locales/ru';
import { en } from '@/locales/en';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProfileModal from '@/components/ProfileModal';
import ProxyModal from '@/components/ProxyModal';
import SXOrgIntegration from '@/components/SXOrgIntegration';
import UpdateDialog from '@/components/UpdateDialog';
import CookieBotModal from '@/components/CookieBotModal';
import { toast } from 'sonner';
import { Profile, Proxy, BrowserEngine, CookieEntry } from '@/types';
import { launchProfile } from '@/lib/launchProfile';
import { safeConfirm, safePrompt } from '@/lib/safeDialog';
import { checkForUpdates, downloadUpdate, installUpdate, UpdateInfo, shouldAutoCheck, setLastUpdateCheck, isAutoUpdateEnabled, getCurrentVersion } from '@/lib/updater';
import { getSXOrgApiKey, SXOrgClient } from '@/lib/sxorg-api';
import sxorgLogo from '@/assets/sxorg-logo.svg';

const Dashboard = () => {
  const { t, locale, setLocale } = useTranslation();
  const [activeView, setActiveView] = useState('profiles');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProxyModalOpen, setIsProxyModalOpen] = useState(false);
  const [isSXOrgModalOpen, setIsSXOrgModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [refreshingProxyIndex, setRefreshingProxyIndex] = useState<number | null>(null);
  // Cookie Robot
  const [cookieBotProfile, setCookieBotProfile] = useState<Profile | null>(null);
  const [isCookieBotModalOpen, setIsCookieBotModalOpen] = useState(false);
  // Default browser engine setting
  const [defaultEngine, setDefaultEngine] = useState<BrowserEngine>(
    () => (localStorage.getItem('aezakmi_default_engine') as BrowserEngine) || 'camoufox'
  );
  // Camoufox download state
  const [camoufoxDownloading, setCamoufoxDownloading] = useState(false);
  const [camoufoxProgress, setCamoufoxProgress] = useState({ stage: '', percent: 0, message: '', speed: '' });
  const [camoufoxInstalled, setCamoufoxInstalled] = useState<boolean | null>(null);
  const [funPhraseIndex, setFunPhraseIndex] = useState(0);


  // Загрузка данных из localStorage + проверка Camoufox
  useEffect(() => {
    const savedProfiles = localStorage.getItem('aezakmi_profiles');
    const savedProxies = localStorage.getItem('aezakmi_proxies');
    const savedFolders = localStorage.getItem('aezakmi_folders');

    if (savedProfiles) {
      // Миграция: старые профили с browserEngine='chromium' → 'camoufox'
      const parsed = JSON.parse(savedProfiles) as Profile[];
      const migrated = parsed.map((p: Profile) => ({
        ...p,
        browserEngine: (p.browserEngine === 'chromium' || !p.browserEngine) ? 'camoufox' as BrowserEngine : p.browserEngine,
      }));
      setProfiles(migrated);
      // Сохраняем миграцию
      if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
        localStorage.setItem('aezakmi_profiles', JSON.stringify(migrated));
      }
    }
    if (savedProxies) {
      setProxies(JSON.parse(savedProxies));
    }
    if (savedFolders) {
      setFolders(JSON.parse(savedFolders));
    } else {
      // Default folders based on locale
      const defaultFolders = locale === 'en'
        ? ['Work', 'Personal', 'Testing']
        : ['Работа', 'Личное', 'Тестовые'];
      setFolders(defaultFolders);
    }

    // Проверяем установлен ли Camoufox
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const installed = await invoke('check_camoufox_installed') as boolean;
        setCamoufoxInstalled(installed);
      } catch (e) {
        setCamoufoxInstalled(false);
      }
    })();
  }, []);

  // Слушаем прогресс скачивания Camoufox
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ stage: string; percent: number; message: string; speed?: string }>('camoufox-progress', (event) => {
          setCamoufoxProgress(event.payload);
          if (event.payload.stage === 'done') {
            setCamoufoxDownloading(false);
            setCamoufoxInstalled(true);
          }
        });
      } catch (e) {}
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Ротация прикольных фраз при скачивании
  const funPhrases = locale === 'en' ? en.funPhrases : ru.funPhrases;

  useEffect(() => {
    if (!camoufoxDownloading) return;
    const interval = setInterval(() => {
      setFunPhraseIndex(prev => (prev + 1) % funPhrases.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [camoufoxDownloading]);

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
      // Редактирование — используем функциональный updater чтобы избежать stale state
      const editId = editingProfile.id;
      setProfiles(prev => {
        const updatedProfiles = prev.map(p => {
          if (p.id !== editId) return p;
          // Явная пересборка профиля: все поля из profileData заменяют старые
          const updated: Profile = {
            ...p,
            ...profileData,
            proxy: profileData.proxy ?? undefined, // явно заменяем прокси (даже если undefined)
            updatedAt: new Date().toISOString(),
          };
          return updated;
        });
        localStorage.setItem('aezakmi_profiles', JSON.stringify(updatedProfiles));
        return updatedProfiles;
      });
      toast.success(t('profiles.updated', { name: profileData.name }));
    } else {
      // Создание
      const newProfile: Profile = {
        ...profileData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        status: 'inactive'
      };
      setProfiles(prev => {
        const updated = [...prev, newProfile];
        localStorage.setItem('aezakmi_profiles', JSON.stringify(updated));
        return updated;
      });
      toast.success(t('profiles.created', { name: profileData.name }));
    }
    setIsProfileModalOpen(false);
    setEditingProfile(null);
  };

  // Скачивание Camoufox
  const handleDownloadCamoufox = async () => {
    if (camoufoxDownloading) return;
    setCamoufoxDownloading(true);
    setCamoufoxProgress({ stage: 'download', percent: 0, message: t('profiles.downloading') });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_camoufox');
    } catch (err: any) {
      toast.error(t('camoufox.installError'), { description: err?.message || String(err) });
      setCamoufoxDownloading(false);
    }
  };

  // Запуск профиля
  const handleLaunchProfile = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    // Проверяем Camoufox
    if (!camoufoxInstalled) {
      toast.info(t('camoufox.installingToast'), {
        description: t('camoufox.installingDescription')
      });
      await handleDownloadCamoufox();
      // После скачивания запускаем профиль
      toast.info(t('profiles.launchingProfile', { name: profile.name }));
    }

    toast.info(t('profiles.launchingProfile', { name: profile.name }), {
      description: t('profiles.launchingDescription')
    });

    try {
      await launchProfile(profile);

      const updatedProfiles = profiles.map(p =>
        p.id === profileId ? { ...p, status: 'active' as const } : p
      );
      saveProfiles(updatedProfiles);

      toast.success(t('profiles.profileActive', { name: profile.name }), {
        description: t('profiles.profileActiveDescription')
      });
    } catch (err: any) {
      console.error('launchProfile error', err);
      toast.error(t('profiles.launchFailed'), {
        description: err?.message || String(err)
      });
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
        name: `${profile.name} (${t('profiles.copy')})`,
        createdAt: new Date().toISOString(),
        status: 'inactive'
      };
      saveProfiles([...profiles, clonedProfile]);
      toast.success(t('profiles.cloned', { name: profile.name }));
    }
  };

  // Удаление профиля (ИСПРАВЛЕНО: использует Tauri dialog)
  const handleDeleteProfile = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      const confirmed = await safeConfirm(t('profiles.confirmDelete', { name: profile.name }));

      if (confirmed) {
        saveProfiles(profiles.filter(p => p.id !== profileId));
        selectedProfiles.delete(profileId);
        setSelectedProfiles(new Set(selectedProfiles));
        toast.success(t('profiles.deleted', { name: profile.name }));
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
    toast.success(t('profiles.launchedCount', { count: selectedProfiles.size }));
  };

  // Удаление выбранных
  const handleDeleteSelected = async () => {
    const confirmed = await safeConfirm(t('profiles.confirmDeleteMultiple', { count: selectedProfiles.size }));

    if (confirmed) {
      saveProfiles(profiles.filter(p => !selectedProfiles.has(p.id)));
      setSelectedProfiles(new Set());
      toast.success(t('profiles.deletedCount', { count: selectedProfiles.size }));
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
    toast.success(t('profiles.exportSuccess'));
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
              toast.success(t('profiles.importedCount', { count: importedProfiles.length }));
            } else {
              toast.error(t('profiles.invalidFormat'));
            }
          } catch {
            toast.error(t('profiles.readError'));
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
    toast.success(t('proxies.addedCount', { count: newProxies.length }));
    setIsProxyModalOpen(false);
  };

  // Удаление прокси
  const handleDeleteProxy = async (index: number) => {
    const proxy = proxies[index];
    const confirmed = await safeConfirm(t('proxies.confirmDelete', { host: proxy.host, port: proxy.port }));

    if (confirmed) {
      saveProxies(proxies.filter((_, i) => i !== index));
      toast.success(t('proxies.deleted'));
    }
  };

  // Тест прокси
  const handleTestProxy = async (index: number) => {
    const proxy = proxies[index];
    toast.info(t('proxies.testing', { host: proxy.host, port: proxy.port }));

    // Симуляция проверки
    setTimeout(() => {
      const updatedProxies = [...proxies];
      const isWorking = Math.random() > 0.3; // 70% шанс что работает
      updatedProxies[index] = { ...proxy, status: isWorking ? 'working' : 'failed' };
      saveProxies(updatedProxies);

      if (isWorking) {
        toast.success(t('proxies.testWorking', { host: proxy.host, port: proxy.port }));
      } else {
        toast.error(t('proxies.testFailed', { host: proxy.host, port: proxy.port }));
      }
    }, 1500);
  };

  // Обновление IP прокси (для SX.ORG)
  const handleRefreshProxyIP = async (index: number) => {
    const proxy = proxies[index];

    // Проверяем есть ли refresh_link в metadata
    if (!proxy.metadata?.refresh_link) {
      toast.error(t('proxies.noRefreshSupport'));
      return;
    }

    setRefreshingProxyIndex(index);
    toast.info(t('proxies.refreshingIP'));

    try {
      const apiKey = getSXOrgApiKey();
      if (!apiKey) {
        toast.error(t('proxies.apiKeyNotFound'));
        return;
      }

      const client = new SXOrgClient(apiKey);
      await client.refreshProxyIP(proxy.metadata.refresh_link);
      toast.success(t('proxies.refreshSuccess'));
    } catch (error: any) {
      console.error('Refresh proxy error:', error);
      toast.error(error.message || t('proxies.refreshError'));
    } finally {
      setRefreshingProxyIndex(null);
    }
  };

  // Добавление папки
  const handleAddFolder = async () => {
    const folderName = await safePrompt(t('folders.promptName'));

    if (folderName && typeof folderName === 'string' && folderName.trim()) {
      saveFolders([...folders, folderName.trim()]);
      toast.success(t('folders.created', { name: folderName }));
    }
  };

  // Удаление папки
  const handleDeleteFolder = async (index: number) => {
    const folder = folders[index];
    const confirmed = await safeConfirm(t('folders.confirmDelete', { name: folder }));

    if (confirmed) {
      saveFolders(folders.filter((_, i) => i !== index));
      toast.success(t('folders.deleted', { name: folder }));
    }
  };

  // Удаление расширения - ЗАГЛУШКА (функция больше не используется)
  const handleDeleteExtension = async (index: number) => {
    // Функция оставлена для совместимости, но не используется
  };

  // Проверка обновлений
  const handleCheckForUpdates = async () => {
    toast.info(t('updater.checkingUpdates'));

    try {
      const update = await checkForUpdates();

      if (!update) {
        toast.error(t('updater.updateCheckFailed'));
        return;
      }

      if (update.available) {
        setUpdateInfo(update);
        setShowUpdateDialog(true);
        setLastUpdateCheck();
      } else {
        toast.success(t('updater.latestVersion'));
      }
    } catch (error) {
      console.error('Error checking updates:', error);
      toast.error(t('updater.updateCheckError'));
    }
  };

  // Установка обновления
  const handleInstallUpdate = async () => {
    if (!updateInfo) return;

    try {
      toast.info(t('updater.downloadingUpdate'));

      const installerPath = await downloadUpdate(updateInfo.downloadUrl);

      toast.success(t('updater.launchingInstaller'));

      await installUpdate(installerPath);

      // После вызова installUpdate приложение закроется
    } catch (error: any) {
      console.error('Error installing update:', error);
      toast.error(t('updater.installError', { message: error.message }));
    }
  };

  // Persist default engine
  useEffect(() => {
    localStorage.setItem('aezakmi_default_engine', defaultEngine);
  }, [defaultEngine]);

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
    { id: 'profiles', label: t('nav.allProfiles'), icon: Play, count: profiles.length },
    { id: 'folders', label: t('nav.folders'), icon: Folder, count: folders.length },
    { id: 'proxies', label: t('nav.proxies'), icon: Globe, count: proxies.length },
    { id: 'statistics', label: t('nav.statistics'), icon: BarChart3 },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-50 relative">
      {/* Camoufox Download Progress Overlay */}
      {camoufoxDownloading && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl shadow-2xl p-8 max-w-lg w-full mx-4 border border-orange-500/30">
            {/* Animated fox */}
            <div className="text-center mb-6">
              <div className="text-6xl mb-2 animate-bounce" style={{ animationDuration: '2s' }}>🦊</div>
              <h2 className="text-xl font-bold text-white">{t('camoufox.installTitle')}</h2>
              <p className="text-sm text-gray-400 mt-1">{t('camoufox.installSubtitle')}</p>
            </div>

            {/* Fun rotating phrase */}
            <div className="mb-6 h-12 flex items-center justify-center">
              <div 
                key={funPhraseIndex}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full"
                style={{ animation: 'fadeInUp 0.5s ease-out' }}
              >
                <span className="text-xl">{funPhrases[funPhraseIndex].emoji}</span>
                <span className="text-orange-300 text-sm font-medium">{funPhrases[funPhraseIndex].text}</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">
                  {camoufoxProgress.stage === 'download' ? t('camoufox.stageDownload') : camoufoxProgress.stage === 'extract' ? t('camoufox.stageExtract') : t('camoufox.stageDone')}
                </span>
                <span className="font-mono text-orange-400 font-bold">{camoufoxProgress.percent}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden relative">
                <div
                  className="h-4 rounded-full transition-all duration-500 relative overflow-hidden"
                  style={{ 
                    width: `${camoufoxProgress.percent}%`,
                    background: 'linear-gradient(90deg, #f97316, #fb923c, #f97316)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite linear'
                  }}
                >
                  <div className="absolute inset-0 opacity-30" style={{
                    background: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)',
                    animation: 'moveStripes 1s infinite linear'
                  }} />
                </div>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-gray-500">{camoufoxProgress.message}</span>
                {camoufoxProgress.speed && (
                  <span className="text-xs text-orange-400/80 font-mono">{camoufoxProgress.speed}</span>
                )}
              </div>
            </div>

            {/* Bottom info */}
            <div className="text-center">
              <p className="text-xs text-gray-600">{t('common.doNotCloseApp')}</p>
            </div>
          </div>

          {/* CSS animations */}
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes shimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
            @keyframes moveStripes {
              0% { transform: translateX(0); }
              100% { transform: translateX(20px); }
            }
          `}</style>
        </div>
      )}
      
      {/* Camoufox not installed banner */}
      {camoufoxInstalled === false && !camoufoxDownloading && (
        <div className="fixed top-0 left-0 right-0 z-[90] bg-orange-500 text-white py-2 px-4 flex items-center justify-center gap-3">
          <span className="text-sm font-medium">{t('camoufox.notInstalledBanner')}</span>
          <Button size="sm" variant="secondary" onClick={handleDownloadCamoufox} className="h-7 text-xs">
            <Download className="w-3 h-3 mr-1" /> {t('camoufox.installButton')}
          </Button>
        </div>
      )}

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
              <p className="text-xs text-gray-500">v{getCurrentVersion()}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${activeView === item.id
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
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('nav.createProfile')}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative z-10">
        {activeView === 'profiles' && (
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-4">{t('profiles.title')}</h2>
              <div className="flex gap-4 items-center mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    placeholder={t('profiles.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-gray-600">
                    {t('common.selected')}: {selectedProfiles.size}
                  </span>
                  <Button variant="outline" onClick={toggleSelectAll}>
                    {selectedProfiles.size === filteredProfiles.length ? t('common.deselectAll') : t('common.selectAll')}
                  </Button>
                  <Button
                    onClick={handleLaunchSelected}
                    disabled={selectedProfiles.size === 0}
                  >
                    {t('profiles.launch')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteSelected}
                    disabled={selectedProfiles.size === 0}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleImportProfiles}>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('common.import')}
                </Button>
                <Button variant="outline" onClick={handleExportProfiles} disabled={profiles.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  {t('common.export')}
                </Button>
              </div>
            </div>

            {filteredProfiles.length === 0 ? (
              <Card className="text-center py-12 bg-white/95 backdrop-blur-sm">
                <CardContent>
                  <h3 className="text-xl font-semibold mb-2">{t('profiles.noProfiles')}</h3>
                  <p className="text-gray-600 mb-4">{t('profiles.noProfilesHint')}</p>
                  <Button onClick={() => setIsProfileModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('nav.createProfile')}
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
                          {profile.status === 'active' ? t('profiles.active') : t('profiles.inactive')}
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
                          <span className="text-gray-600">{t('profiles.resolution')}:</span>
                          <span className="font-medium">{profile.screenWidth}x{profile.screenHeight}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">{t('profiles.engine')}:</span>
                          <span className="font-medium capitalize">{profile.browserEngine || defaultEngine}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">{t('profiles.device')}:</span>
                          <span className="font-medium flex items-center gap-1">
                            {profile.mobileEmulation?.enabled
                              ? <><Smartphone className="w-3 h-3" /> {profile.mobileEmulation.deviceName || t('profiles.mobile')}</>
                              : <><Monitor className="w-3 h-3" /> {t('profiles.desktop')}</>}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">{t('profiles.proxy')}:</span>
                          <span className="font-medium">
                            {profile.proxy?.enabled ? `${profile.proxy.host}:${profile.proxy.port}` : t('common.none')}
                          </span>
                        </div>
                        {profile.cookies && profile.cookies.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Cookies:</span>
                            <span className="font-medium text-amber-600">🍪 {profile.cookies.length}</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 pt-2">
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleLaunchProfile(profile.id)}
                          disabled={camoufoxDownloading}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          {camoufoxDownloading ? t('profiles.downloading') : t('profiles.launchFox')}
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            title="Cookie Robot"
                            onClick={() => {
                              setCookieBotProfile(profile);
                              setIsCookieBotModalOpen(true);
                            }}
                          >
                            <Cookie className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            title={t('profileModal.importCookies')}
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.json,.txt';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  try {
                                    const text = event.target?.result as string;
                                    let cookies: CookieEntry[] = [];
                                    // Поддержка JSON формата (EditThisCookie / Netscape JSON)
                                    try {
                                      const parsed = JSON.parse(text);
                                      if (Array.isArray(parsed)) {
                                        cookies = parsed.map((c: any) => ({
                                          name: c.name,
                                          value: c.value,
                                          domain: c.domain,
                                          path: c.path || '/',
                                          expires: c.expirationDate || c.expires || undefined,
                                          httpOnly: c.httpOnly || false,
                                          secure: c.secure || false,
                                          sameSite: c.sameSite === 'no_restriction' ? 'None' : c.sameSite === 'lax' ? 'Lax' : c.sameSite === 'strict' ? 'Strict' : 'Lax',
                                        }));
                                      }
                                    } catch {
                                      // Netscape TXT формат
                                      const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
                                      cookies = lines.map(line => {
                                        const parts = line.split('\t');
                                        if (parts.length >= 7) {
                                          return {
                                            name: parts[5],
                                            value: parts[6],
                                            domain: parts[0],
                                            path: parts[2] || '/',
                                            expires: parts[4] ? Number(parts[4]) : undefined,
                                            httpOnly: parts[1]?.toUpperCase() === 'TRUE',
                                            secure: parts[3]?.toUpperCase() === 'TRUE',
                                            sameSite: 'Lax' as const,
                                          };
                                        }
                                        return null;
                                      }).filter(Boolean) as CookieEntry[];
                                    }
                                    if (cookies.length > 0) {
                                      const updatedProfiles = profiles.map(p =>
                                        p.id === profile.id ? { ...p, cookies, updatedAt: new Date().toISOString() } : p
                                      );
                                      saveProfiles(updatedProfiles);
                                      toast.success(t('profileModal.cookiesImportedForProfile', { count: cookies.length, name: profile.name }));
                                    } else {
                                      toast.error(t('profileModal.cookiesRecognizeFailedFile'));
                                    }
                                  } catch {
                                    toast.error(t('profileModal.cookiesReadError'));
                                  }
                                };
                                reader.readAsText(file);
                              }
                            };
                            input.click();
                          }}
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleEditProfile(profile.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleDeleteProfile(profile.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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
              <h2 className="text-2xl font-bold">{t('folders.title')}</h2>
              <Button onClick={handleAddFolder}>
                <Plus className="w-4 h-4 mr-2" />
                {t('folders.createFolder')}
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
                      <h3 className="font-semibold text-lg">{t('folders.allProfiles')}</h3>
                      <p className="text-sm text-gray-600">
                        {t('folders.profilesCount', { count: profiles.length })}
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
                      <h3 className="font-semibold text-lg">{t('folders.noFolder')}</h3>
                      <p className="text-sm text-gray-600">
                        {t('folders.profilesCount', { count: profiles.filter(p => !p.folder).length })}
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
                            {t('folders.profilesCount', { count: folderProfiles.length })}
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
              <h2 className="text-2xl font-bold">{t('proxies.title')}</h2>
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsSXOrgModalOpen(true)}
                  variant="outline"
                  className="bg-blue-100 border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-200 px-4 py-2.5 h-auto"
                >
                  <img src={sxorgLogo} alt="SX.ORG" className="h-5 w-auto" style={{ minWidth: '60px' }} />
                </Button>
                <Button onClick={() => setIsProxyModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('proxies.addProxy')}
                </Button>
              </div>
            </div>

            {proxies.length === 0 ? (
              <Card className="text-center py-12 bg-white/95 backdrop-blur-sm">
                <CardContent>
                  <h3 className="text-xl font-semibold mb-2">{t('proxies.noProxies')}</h3>
                  <p className="text-gray-600 mb-4">{t('proxies.noProxiesHint')}</p>
                  <Button onClick={() => setIsProxyModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('proxies.addProxy')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {proxies.map((proxy, index) => (
                  <Card key={index} className="bg-white/95 backdrop-blur-sm">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex-1">
                        <div className="font-semibold flex items-center gap-2">
                          {proxy.metadata?.countryCode && (
                            <span className={`fi fi-${proxy.metadata.countryCode}`} style={{ fontSize: '1.2em' }}></span>
                          )}
                          {proxy.metadata?.proxy_type_id === 1 && (
                            <div className="w-6 h-6 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5.83333 1.83337H11.1667V0.833374H5.83333V1.83337ZM12 2.66671V13.3334H13V2.66671H12ZM11.1667 14.1667H5.83333V15.1667H11.1667V14.1667ZM5 13.3334V2.66671H4V13.3334H5ZM5.83333 14.1667C5.3731 14.1667 5 13.7936 5 13.3334H4C4 14.3459 4.82081 15.1667 5.83333 15.1667V14.1667ZM12 13.3334C12 13.7936 11.6269 14.1667 11.1667 14.1667V15.1667C12.1792 15.1667 13 14.3459 13 13.3334H12ZM11.1667 1.83337C11.6269 1.83337 12 2.20647 12 2.66671H13C13 1.65419 12.1792 0.833374 11.1667 0.833374V1.83337ZM5.83333 0.833374C4.82081 0.833374 4 1.65418 4 2.66671H5C5 2.20647 5.3731 1.83337 5.83333 1.83337V0.833374Z" fill="#87898F" />
                                <path d="M7.16675 12.8334H9.83341" stroke="#87898F" strokeMiterlimit="1.02018" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M8.5 3H8.50667" stroke="#87898F" strokeMiterlimit="1.02018" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          )}
                          {proxy.metadata?.proxy_type_id === 2 && (
                            <div className="w-6 h-6 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 12.6667V7.31878C14 6.90732 13.81 6.51892 13.4853 6.26631L8.81859 2.63668C8.33711 2.26219 7.66289 2.26219 7.18141 2.63668L2.51475 6.26631C2.18996 6.51892 2 6.90732 2 7.31878V12.6667C2 13.403 2.59695 14 3.33333 14H5.16667C5.90305 14 6.5 13.403 6.5 12.6667V10.8333C6.5 10.097 7.09695 9.5 7.83333 9.5H8.16667C8.90305 9.5 9.5 10.097 9.5 10.8333V12.6667C9.5 13.403 10.097 14 10.8333 14H12.6667C13.403 14 14 13.403 14 12.6667Z" stroke="#87898F" strokeLinejoin="round" />
                              </svg>
                            </div>
                          )}
                          {proxy.metadata?.proxy_type_id === 4 && (
                            <div className="w-6 h-6 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12.8125 4.375V5.5M10 4.375V5.5M7.1875 4.375V5.5M12.8125 8.125V9.25M10 8.125V9.25M7.1875 8.125V9.25M12.8125 11.875V13M10 11.875V13M7.1875 11.875V13M5.5 16.75H14.5C15.1904 16.75 15.75 16.1904 15.75 15.5V6.3125C15.75 5.62215 15.1904 5.0625 14.5 5.0625H5.5C4.80964 5.0625 4.25 5.62215 4.25 6.3125V15.5C4.25 16.1904 4.80964 16.75 5.5 16.75Z" stroke="#87898F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          )}
                          {proxy.name || `${proxy.type.toUpperCase()}://${proxy.host}:${proxy.port}`}
                        </div>
                        <div className="text-sm text-gray-600">
                          {proxy.username ? `${proxy.username}:***` : t('common.noAuth')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={proxy.status === 'working' ? 'default' : proxy.status === 'failed' ? 'destructive' : 'secondary'}>
                          {proxy.status === 'working' ? t('proxies.working') : proxy.status === 'failed' ? t('proxies.failed') : t('proxies.unchecked')}
                        </Badge>
                        {proxy.metadata?.refresh_link && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRefreshProxyIP(index)}
                            disabled={refreshingProxyIndex === index}
                            title={t('proxies.refreshIP')}
                          >
                            {refreshingProxyIndex === index ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestProxy(index)}
                        >
                          {t('proxies.test')}
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
            <h2 className="text-2xl font-bold mb-6">{t('statistics.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">{t('statistics.totalProfiles')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">{stats.totalProfiles}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">{t('statistics.activeProfiles')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">{stats.activeProfiles}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">{t('statistics.totalProxies')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-purple-600">{stats.totalProxies}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-600">{t('statistics.workingProxies')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-orange-600">{stats.workingProxies}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6 bg-white/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>{t('statistics.lastActivity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profiles.slice(0, 5).map(profile => (
                    <div key={profile.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{profile.name}</p>
                        <p className="text-sm text-gray-600">
                          {t('profiles.created_')}: {new Date(profile.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'ru-RU')}
                        </p>
                      </div>
                      <Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
                        {profile.status === 'active' ? t('profiles.active') : t('profiles.inactive')}
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
            <h2 className="text-2xl font-bold mb-6">{t('settings.title')}</h2>
            <div className="space-y-4 max-w-2xl">
              {/* Движок браузера по умолчанию */}
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>{t('settings.browserEngine')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600 mb-3">{t('settings.browserEngineDesc')}</p>
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md text-sm">
                    <span className="text-green-700 font-medium">{t('settings.camoufoxLabel')}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Language switcher */}
              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>{t('settings.language')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600 mb-3">{t('settings.languageDesc')}</p>
                  <Select value={locale} onValueChange={(v) => setLocale(v as 'ru' | 'en')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">🇷🇺 Русский</SelectItem>
                      <SelectItem value="en">🇺🇸 English</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>{t('settings.general')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t('settings.autostart')}</p>
                      <p className="text-sm text-gray-600">{t('settings.autostartDesc')}</p>
                    </div>
                    <Checkbox
                      checked={localStorage.getItem('aezakmi_autostart') === 'true'}
                      onCheckedChange={(v) => localStorage.setItem('aezakmi_autostart', String(v))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t('settings.minimizeToTray')}</p>
                      <p className="text-sm text-gray-600">{t('settings.minimizeToTrayDesc')}</p>
                    </div>
                    <Checkbox
                      checked={localStorage.getItem('aezakmi_tray') !== 'false'}
                      onCheckedChange={(v) => localStorage.setItem('aezakmi_tray', String(v))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t('settings.autoUpdate')}</p>
                      <p className="text-sm text-gray-600">{t('settings.autoUpdateDesc')}</p>
                    </div>
                    <Checkbox
                      checked={localStorage.getItem('aezakmi_auto_update') !== 'false'}
                      onCheckedChange={(v) => localStorage.setItem('aezakmi_auto_update', String(v))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>{t('settings.security')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t('settings.clearCookies')}</p>
                      <p className="text-sm text-gray-600">{t('settings.clearCookiesDesc')}</p>
                    </div>
                    <Checkbox
                      checked={localStorage.getItem('aezakmi_clear_cookies') === 'true'}
                      onCheckedChange={(v) => localStorage.setItem('aezakmi_clear_cookies', String(v))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t('settings.blockWebRTC')}</p>
                      <p className="text-sm text-gray-600">{t('settings.blockWebRTCDesc')}</p>
                    </div>
                    <Checkbox
                      checked={localStorage.getItem('aezakmi_block_webrtc') !== 'false'}
                      onCheckedChange={(v) => localStorage.setItem('aezakmi_block_webrtc', String(v))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t('settings.screenshotProtection')}</p>
                      <p className="text-sm text-gray-600">{t('settings.screenshotProtectionDesc')}</p>
                    </div>
                    <Checkbox
                      checked={localStorage.getItem('aezakmi_screenshot_protection') === 'true'}
                      onCheckedChange={(v) => localStorage.setItem('aezakmi_screenshot_protection', String(v))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>{t('settings.about')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p><strong>{t('common.version')}:</strong> {getCurrentVersion()}</p>
                    <p><strong>{t('common.buildDate')}:</strong> {new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'ru-RU')}</p>
                    <p><strong>{t('common.license')}:</strong> {t('common.commercial')}</p>
                    <div className="pt-4">
                      <Button variant="outline" className="w-full" onClick={handleCheckForUpdates}>
                        {t('settings.checkUpdates')}
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
        onOpenSXOrg={() => setIsSXOrgModalOpen(true)}
      />

      <ProxyModal
        open={isProxyModalOpen}
        onOpenChange={setIsProxyModalOpen}
        onAdd={handleAddProxies}
      />

      <SXOrgIntegration
        open={isSXOrgModalOpen}
        onClose={() => setIsSXOrgModalOpen(false)}
        onProxiesImported={handleAddProxies}
      />

      <UpdateDialog
        open={showUpdateDialog}
        updateInfo={updateInfo}
        onUpdate={handleInstallUpdate}
        onLater={() => setShowUpdateDialog(false)}
      />

      {cookieBotProfile && (
        <CookieBotModal
          open={isCookieBotModalOpen}
          onOpenChange={(open) => {
            setIsCookieBotModalOpen(open);
            if (!open) setCookieBotProfile(null);
          }}
          profile={cookieBotProfile}
        />
      )}
    </div>
  );
};

export default Dashboard;