import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { activateLicense } from '@/lib/license';
import { KeyRound, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface LicenseModalProps {
  open: boolean;
  onLicenseActivated: () => void;
}

const LicenseModal = ({ open, onLicenseActivated }: LicenseModalProps) => {
  const { t } = useTranslation();
  const [licenseKey, setLicenseKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError(t('licenseModal.enterKey'));
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    const result = await activateLicense(licenseKey.trim());

    setIsLoading(false);

    if (result.success) {
      setSuccess(result.message);
      setTimeout(() => {
        onLicenseActivated();
      }, 1500);
    } else {
      setError(result.message);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActivate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            {t('licenseModal.title')}
          </DialogTitle>
          <DialogDescription>
            {t('licenseModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="license-key">{t('licenseModal.keyLabel')}</Label>
            <Input
              id="license-key"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-600">
            <p className="font-medium mb-1">{t('licenseModal.info')}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('licenseModal.info1')}</li>
              <li>{t('licenseModal.info2')}</li>
              <li>{t('licenseModal.info3')}</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            onClick={handleActivate}
            disabled={isLoading || !licenseKey.trim()}
            className="w-full"
          >
            {isLoading ? t('licenseModal.activating') : t('licenseModal.activate')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LicenseModal;
