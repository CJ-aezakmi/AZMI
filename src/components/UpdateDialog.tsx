import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { UpdateInfo } from '@/lib/updater';
import { Download, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface UpdateDialogProps {
  open: boolean;
  updateInfo: UpdateInfo | null;
  onUpdate: () => void;
  onLater: () => void;
}

const UpdateDialog = ({ open, updateInfo, onUpdate, onLater }: UpdateDialogProps) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Listen for download progress events from Rust backend
  useEffect(() => {
    if (!isDownloading) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ percent: number; downloaded: number; total: number }>('update-progress', (event) => {
          setDownloadProgress(event.payload.percent);
        });
      } catch (e) {
        console.error('Failed to listen for update-progress:', e);
      }
    })();
    return () => { if (unlisten) unlisten(); };
  }, [isDownloading]);

  if (!updateInfo || !updateInfo.available) return null;

  const handleUpdate = async () => {
    setIsDownloading(true);
    setError(null);

    try {
      await onUpdate();
    } catch (err: any) {
      setError(err.message || t('common.error'));
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && !isDownloading && onLater()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" />
            {t('updater.available')}
          </DialogTitle>
          <DialogDescription>
            {t('updater.availableDesc', { version: updateInfo.version })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isDownloading ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{t('updater.downloading')}</span>
                  <span>{downloadProgress}%</span>
                </div>
                <Progress value={downloadProgress} />
              </div>
              <p className="text-sm text-gray-600 text-center">
                                {t('updater.pleaseWait')}
              </p>
            </>
          ) : error ? (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">{t('common.error')}</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="font-semibold text-blue-900 mb-2">{t('updater.whatsNew')}</h4>
                <div className="text-sm text-blue-800 whitespace-pre-line max-h-40 overflow-y-auto">
                  {updateInfo.releaseNotes}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>
                  {t('updater.published')} {new Date(updateInfo.publishedAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isDownloading && !error && (
            <>
              <Button variant="outline" onClick={onLater}>
                {t('updater.later')}
              </Button>
              <Button onClick={handleUpdate}>
                <Download className="w-4 h-4 mr-2" />
                {t('updater.updateNow')}
              </Button>
            </>
          )}
          {error && (
            <Button variant="outline" onClick={() => setError(null)}>
              {t('common.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateDialog;
