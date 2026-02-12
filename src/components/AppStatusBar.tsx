import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { X, Download, CheckCircle, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { checkForUpdates, shouldAutoCheck, setLastUpdateCheck, isAutoUpdateEnabled, getCurrentVersion, downloadUpdate, installUpdate, UpdateInfo } from '@/lib/updater';

type BarMode = 'hidden' | 'checking' | 'update-available' | 'updating' | 'components' | 'up-to-date' | 'error';

const AppStatusBar = () => {
    const [mode, setMode] = useState<BarMode>('hidden');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [dismissed, setDismissed] = useState(false);

    // Проверка обновлений программы
    const checkUpdates = useCallback(async () => {
        if (!isAutoUpdateEnabled() || !shouldAutoCheck()) return;

        setMode('checking');
        setMessage('Проверка обновлений...');

        try {
            const update = await checkForUpdates();
            setLastUpdateCheck();

            if (update && update.available) {
                setUpdateInfo(update);
                setMode('update-available');
                setMessage(`Доступна новая версия v${update.version}`);
            } else {
                // Проверяем компоненты
                await checkComponentUpdates();
            }
        } catch {
            // Не критичная ошибка — просто скрываем бар
            await checkComponentUpdates();
        }
    }, []);

    // Проверка обновлений компонентов (браузеров)
    const checkComponentUpdates = async () => {
        try {
            const browsersOk = await invoke<boolean>('check_browsers_installed');

            if (!browsersOk) {
                setMode('components');
                setMessage('Обновление компонентов браузера...');
                setProgress(0);

                try {
                    await invoke<string>('install_playwright_browsers_cmd');
                    setProgress(100);
                    setMessage('Компоненты обновлены!');
                } catch {
                    // Не критично — браузер может работать и без обновления
                    console.warn('Browser component update skipped');
                }

                setTimeout(() => {
                    setMode('up-to-date');
                    setMessage('Версия актуальна — v' + getCurrentVersion());
                }, 2000);
            } else {
                setMode('up-to-date');
                setMessage('Версия актуальна — v' + getCurrentVersion());
            }
        } catch {
            // Ошибка проверки компонентов — не показываем ошибку пользователю
            setMode('up-to-date');
            setMessage('Версия актуальна — v' + getCurrentVersion());
        }

        // Автоскрытие через 5 сек если всё ок
        setTimeout(() => {
            setMode(prev => prev === 'up-to-date' ? 'hidden' : prev);
        }, 5000);
    };

    // Скачивание и установка обновления
    const handleUpdate = async () => {
        if (!updateInfo) return;

        setMode('updating');
        setMessage('Скачивание обновления...');
        setProgress(0);

        try {
            const installerPath = await downloadUpdate(updateInfo.downloadUrl, (percent) => {
                setProgress(percent);
            });

            setMessage('Запуск установщика...');
            await installUpdate(installerPath);
        } catch (err: any) {
            setMode('error');
            setMessage(`Ошибка обновления: ${err?.message || 'неизвестная ошибка'}`);
        }
    };

    const handleDismiss = () => {
        setDismissed(true);
        setMode('hidden');
    };

    useEffect(() => {
        // Запускаем проверку через 2 секунды после загрузки
        const timer = setTimeout(checkUpdates, 2000);
        return () => clearTimeout(timer);
    }, [checkUpdates]);

    if (mode === 'hidden' || dismissed) return null;

    // Определяем цвета и иконку по режиму
    const config = {
        checking: { bg: 'bg-blue-600', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
        'update-available': { bg: 'bg-amber-600', icon: <Download className="w-4 h-4" /> },
        updating: { bg: 'bg-blue-600', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
        components: { bg: 'bg-indigo-600', icon: <RefreshCw className="w-4 h-4 animate-spin" /> },
        'up-to-date': { bg: 'bg-green-600', icon: <CheckCircle className="w-4 h-4" /> },
        error: { bg: 'bg-red-600', icon: <AlertTriangle className="w-4 h-4" /> },
    }[mode] || { bg: 'bg-gray-600', icon: null };

    return (
        <div className={`${config.bg} text-white px-4 py-2 flex items-center gap-3 text-sm relative z-50 shadow-lg`}>
            {/* Иконка */}
            {config.icon}

            {/* Сообщение */}
            <span className="flex-1">{message}</span>

            {/* Прогресс бар для скачивания/установки */}
            {(mode === 'updating' || mode === 'components') && progress > 0 && (
                <div className="w-32">
                    <Progress value={progress} className="h-1.5" />
                </div>
            )}

            {/* Кнопка обновления */}
            {mode === 'update-available' && (
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleUpdate}
                    className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
                >
                    <Download className="w-3 h-3 mr-1" />
                    Обновить
                </Button>
            )}

            {/* Кнопка повтора при ошибке */}
            {mode === 'error' && (
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={checkUpdates}
                    className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
                >
                    Повторить
                </Button>
            )}

            {/* Кнопка закрытия */}
            {mode !== 'updating' && mode !== 'components' && (
                <button
                    onClick={handleDismiss}
                    className="hover:bg-white/20 rounded-full p-1 transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};

export default AppStatusBar;
