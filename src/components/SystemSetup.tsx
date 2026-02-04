import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SetupStatus {
  stage: string;
  progress: number;
  message: string;
}

interface SystemSetupProps {
  onComplete: () => void;
}

export default function SystemSetup({ onComplete }: SystemSetupProps) {
  const [status, setStatus] = useState<SetupStatus>({
    stage: 'checking',
    progress: 0,
    message: 'Проверка системы...'
  });

  useEffect(() => {
    const setupSystem = async () => {
      try {
        // Проверяем зависимости
        setStatus({ stage: 'checking', progress: 10, message: 'Проверка зависимостей...' });
        
        const hasNode = await invoke<boolean>('check_node_installed');
        const hasPlaywright = await invoke<boolean>('check_playwright_installed');

        if (hasNode && hasPlaywright) {
          setStatus({ stage: 'complete', progress: 100, message: 'Всё готово!' });
          setTimeout(onComplete, 500);
          return;
        }

        // Устанавливаем Node.js
        if (!hasNode) {
          setStatus({ stage: 'node', progress: 20, message: 'Установка Node.js...' });
          await invoke('install_node_runtime');
          setStatus({ stage: 'node', progress: 50, message: 'Node.js установлен!' });
        }

        // Устанавливаем Playwright
        if (!hasPlaywright) {
          setStatus({ stage: 'playwright', progress: 60, message: 'Установка Playwright и Chromium...' });
          await invoke('install_playwright_runtime');
          setStatus({ stage: 'playwright', progress: 90, message: 'Playwright установлен!' });
        }

        setStatus({ stage: 'complete', progress: 100, message: 'Установка завершена!' });
        setTimeout(onComplete, 1000);

      } catch (error) {
        console.error('Setup error:', error);
        setStatus({ 
          stage: 'error', 
          progress: 0, 
          message: `Ошибка: ${error}` 
        });
      }
    };

    setupSystem();
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
      <div className="w-full max-w-2xl mx-8">
        {/* Логотип */}
        <div className="text-center mb-12">
          <div className="inline-block relative">
            <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]">
              A
            </div>
          </div>
          <h1 className="text-4xl font-black text-white mt-4 tracking-wider">
            AEZAKMI
          </h1>
          <p className="text-gray-400 mt-2 text-sm uppercase tracking-[0.3em]">
            Pro Edition v2.0.0
          </p>
        </div>

        {/* Прогресс */}
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
          <div className="space-y-6">
            {/* Статус */}
            <div className="text-center">
              <p className="text-xl text-white font-semibold mb-2">
                {status.message}
              </p>
              <p className="text-gray-400 text-sm">
                Пожалуйста, подождите...
              </p>
            </div>

            {/* Прогресс-бар */}
            <div className="relative">
              <div className="h-3 bg-gray-700/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out relative"
                  style={{ width: `${status.progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
              <div className="text-right mt-2">
                <span className="text-blue-400 text-sm font-mono">{status.progress}%</span>
              </div>
            </div>

            {/* Индикатор загрузки */}
            {status.stage !== 'complete' && status.stage !== 'error' && (
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              </div>
            )}

            {/* Информация */}
            <div className="text-center text-xs text-gray-500 space-y-1">
              <p>Выполняется первоначальная настройка</p>
              <p>Это нужно сделать только один раз</p>
            </div>
          </div>
        </div>

        {/* Версия */}
        <div className="text-center mt-8 text-gray-600 text-xs">
          <p>© 2025 AEZAKMI Pro. Все права защищены.</p>
        </div>
      </div>
    </div>
  );
}
