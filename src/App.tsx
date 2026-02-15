import { Toaster } from '@/components/ui/sonner';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import LicenseModal from './components/LicenseModal';
import SetupWizard from './components/SetupWizard';
import AppStatusBar from './components/AppStatusBar';
import { checkLicense, LicenseInfo } from './lib/license';
import { I18nProvider, useTranslation } from '@/lib/i18n';

const AppInner = () => {
  const { t } = useTranslation();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);
  const [setupDone, setSetupDone] = useState(() => {
    return localStorage.getItem('aezakmi_setup_done') === 'true';
  });

  useEffect(() => {
    const verifyLicense = async () => {
      const licenseInfo = await checkLicense();
      setLicense(licenseInfo);
      setIsCheckingLicense(false);
    };

    verifyLicense();
  }, []);

  const handleLicenseActivated = async () => {
    const licenseInfo = await checkLicense();
    setLicense(licenseInfo);
  };

  const handleSetupComplete = () => {
    setSetupDone(true);
  };

  if (isCheckingLicense) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('licenseModal.checkingLicense')}</p>
        </div>
      </div>
    );
  }

  if (!license || !license.isValid) {
    return (
      <>
        <Toaster />
        <LicenseModal open={true} onLicenseActivated={handleLicenseActivated} />
      </>
    );
  }

  // Показываем мастер первоначальной настройки
  if (!setupDone) {
    return (
      <>
        <Toaster />
        <SetupWizard onSetupComplete={handleSetupComplete} />
      </>
    );
  }

  return (
    <>
      <Toaster />
      {/* Статус-бар: обновления + компоненты */}
      <AppStatusBar />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

const App = () => (
  <I18nProvider>
    <AppInner />
  </I18nProvider>
);

export default App;