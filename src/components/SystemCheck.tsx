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
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    checkAndInstall();
  }, []);

  const checkAndInstall = async () => {
    setIsChecking(true);
    
    try {
      const systemStatus = await dependencyManager.checkSystemStatus();
      setStatus(systemStatus);
      
      if (!systemStatus.allReady) {
        // Автоматически начинаем установку
        setIsInstalling(true);
        await performInstallation();
      } else {
        // Всё готово
        setTimeout(() => onReady(), 500);
      }
    } catch (err: any) {
      console.error('System check failed:', err);
      setTimeout(() => onReady(), 1000); // Пропускаем при ошибке
    } finally {
      setIsChecking(false);
    }
  };

  const performInstallation = async () => {
    setProgress(10);
    setCurrentStep('Проверка Node.js...');
    
    const nodeInstalled = await dependencyManager.checkNodeJs();
    
    if (!nodeInstalled.installed) {
      setCurrentStep('Требуется Node.js');
      setProgress(20);
      // Даём время прочитать сообщение
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Открываем ссылку на скачивание Node.js
      window.open('https://nodejs.org/dist/v18.20.5/node-v18.20.5-x64.msi', '_blank');
      
      setCurrentStep('Установите Node.js и перезапустите приложение');
      return;
    }

    setProgress(40);
    setCurrentStep('Установка Playwright...');
    
    await dependencyManager.installPlaywrightBrowsers((msg) => {
      // Игнорируем подробные сообщения
      if (msg.includes('✅')) {
        setProgress(100);
        setCurrentStep('Готово!');
      } else if (msg.includes('Загрузка')) {
        setProgress(60);
        setCurrentStep('Загрузка браузера...');
      }
    });

    setProgress(100);
    setCurrentStep('Установка завершена');
    
    setTimeout(() => onReady(), 1000);
  };

  const getDependencyIcon = (installed: boolean) => {
    if (installed) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  if (isChecking || isInstalling) {
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Настройка системы
            </DialogTitle>
            <DialogDescription>
              Установка необходимых компонентов
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-6">
            {/* Прогресс-бар */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{currentStep}</span>
                <span className="text-gray-600">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {currentStep.includes('Node.js') && !currentStep.includes('Проверка') && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Node.js не установлен. Скачайте и установите Node.js, затем перезапустите приложение.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
};
