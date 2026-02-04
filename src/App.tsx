import { Toaster } from '@/components/ui/sonner';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import LicenseModal from './components/LicenseModal';
import SystemCheck from './components/SystemCheck';
import { checkLicense, LicenseInfo } from './lib/license';

const App = () => {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);
  const [systemReady, setSystemReady] = useState(false);

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

  const handleSystemReady = () => {
    setSystemReady(true);
  };

  if (isCheckingLicense) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Проверка лицензии...</p>
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

  // Проверка и установка системных зависимостей
  if (!systemReady) {
    return (
      <>
        <Toaster />
        <SystemCheck onReady={handleSystemReady} />
      </>
    );
  }

  return (
    <>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

export default App;