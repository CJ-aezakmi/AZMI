import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Download, Loader2, ExternalLink } from 'lucide-react';

type SetupStep = 'checking' | 'need-nodejs' | 'installing-nodejs' | 'installing-browsers' | 'ready' | 'error';

interface SetupWizardProps {
    onSetupComplete: () => void;
}

const SetupWizard = ({ onSetupComplete }: SetupWizardProps) => {
    const [step, setStep] = useState<SetupStep>('checking');
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('Проверка компонентов...');
    const [errorMessage, setErrorMessage] = useState('');

    const checkComponents = useCallback(async () => {
        setStep('checking');
        setProgress(10);
        setStatusMessage('Проверка Node.js...');

        try {
            const nodeInstalled = await invoke<boolean>('check_node_installed');
            setProgress(30);

            if (!nodeInstalled) {
                setStep('need-nodejs');
                setStatusMessage('Требуется установка Node.js');
                return;
            }

            setStatusMessage('Проверка браузеров...');
            setProgress(50);

            const browsersInstalled = await invoke<boolean>('check_browsers_installed');
            setProgress(70);

            if (!browsersInstalled) {
                setStep('installing-browsers');
                setStatusMessage('Установка необходимых компонентов...');
                await installBrowsers();
                return;
            }

            setProgress(100);
            setStep('ready');
            setStatusMessage('Все компоненты готовы!');

            // Сохраняем флаг и входим в приложение
            localStorage.setItem('aezakmi_setup_done', 'true');
            setTimeout(onSetupComplete, 800);
        } catch (err: any) {
            console.error('Setup check error:', err);
            setStep('error');
            setErrorMessage(err?.message || 'Ошибка проверки компонентов');
        }
    }, [onSetupComplete]);

    const handleInstallNodeJS = async () => {
        setStep('installing-nodejs');
        setStatusMessage('Скачивание Node.js с официального сайта...');
        setProgress(20);

        try {
            // Скачиваем и запускаем Node.js installer
            const result = await invoke<string>('download_and_run_nodejs_installer');
            setProgress(80);
            setStatusMessage(result || 'Node.js установлен! Проверяем компоненты...');

            // Ждём завершения установки и перепроверяем
            await new Promise(resolve => setTimeout(resolve, 3000));
            setProgress(90);

            // Перепроверяем всё
            await checkComponents();
        } catch (err: any) {
            console.error('Node.js install error:', err);
            setStep('error');
            setErrorMessage(err?.message || 'Ошибка установки Node.js. Установите вручную с https://nodejs.org');
        }
    };

    const installBrowsers = async () => {
        setStep('installing-browsers');
        setStatusMessage('Установка Chromium браузера...');
        setProgress(60);

        try {
            await invoke<string>('install_playwright_browsers_cmd');
            setProgress(100);
            setStep('ready');
            setStatusMessage('Все компоненты установлены!');
            localStorage.setItem('aezakmi_setup_done', 'true');
            setTimeout(onSetupComplete, 800);
        } catch (err: any) {
            console.error('Browser install error:', err);
            setStep('error');
            setErrorMessage(err?.message || 'Ошибка установки браузера');
        }
    };

    useEffect(() => {
        checkComponents();
    }, [checkComponents]);

    return (
        <div className="flex items-center justify-center h-screen bg-cover bg-center bg-no-repeat"
             style={{ backgroundImage: 'url(/assets/background.webp)' }}>
            <div className="w-full max-w-lg mx-4">
                {/* Logo */}
                <div className="text-center mb-8 flex flex-col items-center">
                    <img src="/assets/logo.jpg" alt="AEZAKMI Logo" className="w-16 h-16 rounded-xl object-cover mb-3 shadow-lg" />
                    <h1 className="text-4xl font-bold text-white mb-2">AEZAKMI Pro</h1>
                    <p className="text-gray-400 text-sm">Antidetect Browser</p>
                </div>

                {/* Card */}
                <div className="bg-gray-800/80 backdrop-blur-xl border border-gray-700 rounded-2xl p-8 shadow-2xl">
                    {/* Status Icon */}
                    <div className="flex justify-center mb-6">
                        {step === 'checking' && (
                            <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
                        )}
                        {step === 'need-nodejs' && (
                            <Download className="w-16 h-16 text-amber-400" />
                        )}
                        {(step === 'installing-nodejs' || step === 'installing-browsers') && (
                            <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
                        )}
                        {step === 'ready' && (
                            <CheckCircle className="w-16 h-16 text-green-400" />
                        )}
                        {step === 'error' && (
                            <XCircle className="w-16 h-16 text-red-400" />
                        )}
                    </div>

                    {/* Status Text */}
                    <h2 className="text-xl font-semibold text-white text-center mb-2">
                        {step === 'checking' && 'Проверка системы'}
                        {step === 'need-nodejs' && 'Требуется Node.js'}
                        {step === 'installing-nodejs' && 'Установка Node.js'}
                        {step === 'installing-browsers' && 'Установка компонентов'}
                        {step === 'ready' && 'Готово!'}
                        {step === 'error' && 'Ошибка'}
                    </h2>

                    <p className="text-gray-400 text-center text-sm mb-6">
                        {statusMessage}
                    </p>

                    {/* Progress Bar */}
                    {(step === 'checking' || step === 'installing-nodejs' || step === 'installing-browsers') && (
                        <div className="mb-6">
                            <Progress value={progress} className="h-2" />
                            <p className="text-xs text-gray-500 text-center mt-2">{progress}%</p>
                        </div>
                    )}

                    {/* Need Node.js */}
                    {step === 'need-nodejs' && (
                        <div className="space-y-4">
                            <p className="text-gray-300 text-sm text-center">
                                Node.js необходим для работы браузерных профилей.
                                Нажмите кнопку ниже, чтобы скачать и установить
                                последнюю версию с официального сайта.
                            </p>
                            <Button
                                onClick={handleInstallNodeJS}
                                className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base"
                            >
                                <Download className="w-5 h-5 mr-2" />
                                Установить Node.js
                            </Button>
                            <a
                                href="https://nodejs.org"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                <ExternalLink className="w-3 h-3" />
                                Или скачайте вручную с nodejs.org
                            </a>
                        </div>
                    )}

                    {/* Error */}
                    {step === 'error' && (
                        <div className="space-y-4">
                            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                                <p className="text-red-300 text-sm">{errorMessage}</p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    onClick={checkComponents}
                                    variant="outline"
                                    className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                                >
                                    Повторить
                                </Button>
                                <Button
                                    onClick={onSetupComplete}
                                    variant="outline"
                                    className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                                >
                                    Пропустить
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-gray-600 text-xs text-center mt-6">
                    v2.1.0 &copy; AEZAKMI Team
                </p>
            </div>
        </div>
    );
};

export default SetupWizard;
