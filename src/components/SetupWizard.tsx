import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

type SetupStep = 'checking' | 'ready' | 'error';

interface SetupWizardProps {
    onSetupComplete: () => void;
}

const SetupWizard = ({ onSetupComplete }: SetupWizardProps) => {
    const { t } = useTranslation();
    const [step, setStep] = useState<SetupStep>('checking');
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    // Set initial status message after translation is available
    useEffect(() => { if (!statusMessage) setStatusMessage(t('setup.checkingComponents')); }, []);

    const checkComponents = useCallback(async () => {
        setStep('checking');
        setProgress(10);
        setStatusMessage(t('setup.checkingNodeJS'));

        try {
            // Проверяем Node.js (bundled идёт в комплекте)
            const nodeInstalled = await invoke<boolean>('check_node_installed');
            setProgress(50);

            if (!nodeInstalled) {
                setStep('error');
                setErrorMessage(t('setup.nodeNotFound'));
                return;
            }

            setStatusMessage(t('setup.nodeJSFound'));
            setProgress(100);

            // Всё готово — Camoufox скачивается при первом запуске профиля
            setStep('ready');
            setStatusMessage(t('setup.allReady'));

            localStorage.setItem('aezakmi_setup_done', 'true');
            setTimeout(onSetupComplete, 800);
        } catch (err: any) {
            console.error('Setup check error:', err);
            setStep('error');
            setErrorMessage(err?.message || t('setup.componentCheckError'));
        }
    }, [onSetupComplete]);

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
                        {step === 'ready' && (
                            <CheckCircle className="w-16 h-16 text-green-400" />
                        )}
                        {step === 'error' && (
                            <XCircle className="w-16 h-16 text-red-400" />
                        )}
                    </div>

                    {/* Status Text */}
                    <h2 className="text-xl font-semibold text-white text-center mb-2">
                        {step === 'checking' && t('setup.checkingSystem')}
                        {step === 'ready' && t('common.ready')}
                        {step === 'error' && t('common.error')}
                    </h2>

                    <p className="text-gray-400 text-center text-sm mb-6">
                        {statusMessage}
                    </p>

                    {/* Progress Bar */}
                    {step === 'checking' && (
                        <div className="mb-6">
                            <Progress value={progress} className="h-2" />
                            <p className="text-xs text-gray-500 text-center mt-2">{progress}%</p>
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
                                    {t('common.retry')}
                                </Button>
                                <Button
                                    onClick={onSetupComplete}
                                    variant="outline"
                                    className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                                >
                                    {t('common.skip')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-gray-600 text-xs text-center mt-6">
                    v3.0.7 &copy; AEZAKMI Team
                </p>
            </div>
        </div>
    );
};

export default SetupWizard;
