import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { UpdateInfo } from '@/lib/updater';
import { Download, CheckCircle, AlertCircle } from 'lucide-react';

interface UpdateDialogProps {
  open: boolean;
  updateInfo: UpdateInfo | null;
  onUpdate: () => void;
  onLater: () => void;
}

const UpdateDialog = ({ open, updateInfo, onUpdate, onLater }: UpdateDialogProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!updateInfo || !updateInfo.available) return null;

  const handleUpdate = async () => {
    setIsDownloading(true);
    setError(null);
    
    try {
      await onUpdate();
    } catch (err: any) {
      setError(err.message || 'Ошибка при обновлении');
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && !isDownloading && onLater()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" />
            Доступно обновление
          </DialogTitle>
          <DialogDescription>
            Новая версия AEZAKMI v{updateInfo.version} готова к установке
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isDownloading ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Скачивание...</span>
                  <span>{downloadProgress}%</span>
                </div>
                <Progress value={downloadProgress} />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Пожалуйста, подождите. Не закрывайте программу.
              </p>
            </>
          ) : error ? (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Ошибка</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Что нового:</h4>
                <div className="text-sm text-blue-800 whitespace-pre-line max-h-40 overflow-y-auto">
                  {updateInfo.releaseNotes}
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>
                  Опубликовано: {new Date(updateInfo.publishedAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isDownloading && !error && (
            <>
              <Button variant="outline" onClick={onLater}>
                Позже
              </Button>
              <Button onClick={handleUpdate}>
                <Download className="w-4 h-4 mr-2" />
                Обновить сейчас
              </Button>
            </>
          )}
          {error && (
            <Button variant="outline" onClick={() => setError(null)}>
              Закрыть
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateDialog;
