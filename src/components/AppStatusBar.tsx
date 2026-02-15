import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { X, Download, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { checkForUpdates, shouldAutoCheck, setLastUpdateCheck, isAutoUpdateEnabled, getCurrentVersion, downloadUpdate, installUpdate, UpdateInfo } from '@/lib/updater';
import { useTranslation } from '@/lib/i18n';

type BarMode = 'hidden' | 'checking' | 'update-available' | 'updating' | 'up-to-date' | 'error';

const AppStatusBar = () => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<BarMode>('hidden');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [dismissed, setDismissed] = useState(false);

    // Listen for download progress events from Rust backend
    useEffect(() => {
        if (mode !== 'updating') return;
        let unlisten: (() => void) | null = null;
        (async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                unlisten = await listen<{ percent: number }>('update-progress', (event) => {
                    setProgress(event.payload.percent);
                });
            } catch (e) { /* ignore */ }
        })();
        return () => { if (unlisten) unlisten(); };
    }, [mode]);

    // Проверка обновлений программы (без проверки Playwright компонентов)
    const checkUpdates = useCallback(async () => {
        if (!isAutoUpdateEnabled() || !shouldAutoCheck()) return;

        setMode('checking');
        setMessage(t('updater.checkingUpdates'));

        try {
            const update = await checkForUpdates();
            setLastUpdateCheck();

            if (update && update.available) {
                setUpdateInfo(update);
                setMode('update-available');
                setMessage(t('updater.newVersionAvailable', { version: update.version }));
            } else {
                setMode('up-to-date');
                setMessage(t('updater.versionUpToDate', { version: getCurrentVersion() }));
                // Автоскрытие через 5 сек
                setTimeout(() => {
                    setMode(prev => prev === 'up-to-date' ? 'hidden' : prev);
                }, 5000);
            }
        } catch {
            // Не критичная ошибка — просто скрываем бар
            setMode('hidden');
        }
    }, []);

    // Скачивание и установка обновления
    const handleUpdate = async () => {
        if (!updateInfo) return;

        setMode('updating');
        setMessage(t('updater.downloadingUpdate'));
        setProgress(0);

        try {
            const installerPath = await downloadUpdate(updateInfo.downloadUrl);

            setMessage(t('updater.launchingInstaller'));
            await installUpdate(installerPath);
        } catch (err: any) {
            setMode('error');
            setMessage(t('updater.updateError', { message: err?.message || 'unknown error' }));
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
        'up-to-date': { bg: 'bg-green-600', icon: <CheckCircle className="w-4 h-4" /> },
        error: { bg: 'bg-red-600', icon: <AlertTriangle className="w-4 h-4" /> },
    }[mode] || { bg: 'bg-gray-600', icon: null };

    return (
        <div className={`${config.bg} text-white px-4 py-2 flex items-center gap-3 text-sm relative z-50 shadow-lg`}>
            {/* Иконка */}
            {config.icon}

            {/* Сообщение */}
            <span className="flex-1">{message}</span>

            {/* Прогресс бар для скачивания */}
            {mode === 'updating' && progress > 0 && (
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
                    {t('statusBar.update')}
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
                    {t('statusBar.retry')}
                </Button>
            )}

            {/* Кнопка закрытия */}
            {mode !== 'updating' && (
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
