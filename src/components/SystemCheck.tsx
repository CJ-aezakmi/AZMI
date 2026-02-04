import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';
import { dependencyManager, SystemStatus } from '@/lib/dependency-manager';

interface SystemCheckProps {
  onReady: () => void;
}

export const SystemCheck = ({ onReady }: SystemCheckProps) => {
  const [isChecking, setIsChecking] = useState(true);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    checkSystem();
  }, []);

  const checkSystem = async () => {
    setIsChecking(true);
    setError('');
    
    try {
      const systemStatus = await dependencyManager.checkSystemStatus();
      setStatus(systemStatus);
      
      if (systemStatus.allReady) {
        // Всё готово - проверяем обновления компонентов
        const updates = await dependencyManager.checkComponentUpdates();
        
        if (updates.playwrightNeedsUpdate || updates.browsersNeedUpdate) {
          // Есть обновления - предлагаем установить
          setInstallProgress(['⚠️ Обнаружены устаревшие компоненты']);
        } else {
          // Всё актуально - запускаем приложение
          setTimeout(() => onReady(), 500);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка проверки системы');
    } finally {
      setIsChecking(false);
    }
  };

  const handleAutoFix = async () => {
    setIsInstalling(true);
    setInstallProgress([]);
    setError('');

    try {
      const success = await dependencyManager.autoFix((message) => {
        setInstallProgress(prev => [...prev, message]);
      });

      if (success) {
        setInstallProgress(prev => [...prev, '✅ Все компоненты установлены!']);
        setTimeout(() => onReady(), 2000);
      } else {
        setError('Не удалось установить некоторые компоненты. Попробуйте перезапустить приложение.');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка установки компонентов');
    } finally {
      setIsInstalling(false);
    }
  };

  const getDependencyIcon = (installed: boolean) => {
    if (installed) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  if (isChecking) {
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Проверка системы
            </DialogTitle>
            <DialogDescription>
              Проверяем установленные компоненты...
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!status) return null;

  if (status.allReady && installProgress.length === 0) {
    // Всё готово - ничего не показываем
    return null;
  }

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            Настройка системы
          </DialogTitle>
          <DialogDescription>
            Для работы приложения требуется установить дополнительные компоненты
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Список зависимостей */}
          <div className="space-y-2">
            {status.dependencies.map((dep, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                {getDependencyIcon(dep.installed)}
                <div className="flex-1">
                  <div className="font-medium">{dep.name}</div>
                  {dep.version && (
                    <div className="text-sm text-gray-500">Версия: {dep.version}</div>
                  )}
                  {dep.error && (
                    <div className="text-sm text-red-500">{dep.error}</div>
                  )}
                </div>
                {dep.required && !dep.installed && (
                  <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                    Требуется
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Прогресс установки */}
          {installProgress.length > 0 && (
            <div className="bg-gray-900 text-gray-100 p-4 rounded-md max-h-48 overflow-y-auto font-mono text-sm">
              {installProgress.map((msg, index) => (
                <div key={index} className="py-1">
                  {msg}
                </div>
              ))}
            </div>
          )}

          {/* Ошибка */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Кнопки */}
          <div className="flex gap-3">
            {!isInstalling && (
              <Button 
                onClick={handleAutoFix}
                className="flex-1"
                disabled={isInstalling}
              >
                <Download className="w-4 h-4 mr-2" />
                Установить автоматически
              </Button>
            )}
            
            {isInstalling && (
              <Button disabled className="flex-1">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Установка...
              </Button>
            )}
          </div>

          {/* Информация */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>📦 Будет установлено:</p>
            <ul className="list-disc list-inside pl-2 space-y-1">
              {!status.nodeJs.installed && (
                <li>Node.js (портативная версия)</li>
              )}
              {!status.playwrightBrowsers.installed && (
                <li>Chromium браузер для Playwright (~300 МБ)</li>
              )}
            </ul>
            <p className="pt-2">Все компоненты будут установлены локально в папку приложения.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
