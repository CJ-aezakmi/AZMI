import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Cookie, Play, Square, Clock, Globe, Settings2 } from 'lucide-react';
import {
  CookieBotConfig,
  CookieBotCategory,
  getDefaultCookieBotConfig,
  getAvailableCategories,
  estimateTime,
  startCookieBot,
  stopCookieBot,
  isCookieBotRunning,
  buildSiteList,
} from '@/lib/cookie-bot';
import { toast } from 'sonner';
import { Profile } from '@/types';
import { useTranslation } from '@/lib/i18n';

interface CookieBotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
}

export default function CookieBotModal({ open, onOpenChange, profile }: CookieBotModalProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<CookieBotConfig>(getDefaultCookieBotConfig());
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSite, setCurrentSite] = useState('');
  const [visitedCount, setVisitedCount] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const categories = getAvailableCategories();
  const siteList = buildSiteList(config);
  const eta = estimateTime(config);

  useEffect(() => {
    if (profile) {
      setIsRunning(isCookieBotRunning(profile.id));
    }
  }, [profile, open]);

  // Симуляция прогресса при запуске
  useEffect(() => {
    if (!isRunning) return;
    
    let idx = 0;
    const sites = siteList;
    
    const interval = setInterval(() => {
      if (idx >= sites.length) {
        setIsRunning(false);
        setProgress(100);
        toast.success(t('cookieBot.completed', { count: String(sites.length) }));
        clearInterval(interval);
        return;
      }
      
      setCurrentSite(sites[idx]);
      setVisitedCount(idx + 1);
      setProgress(Math.round(((idx + 1) / sites.length) * 100));
      idx++;
    }, config.timePerSite * 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const toggleCategory = (cat: CookieBotCategory) => {
    setConfig(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const handleStart = async () => {
    if (!profile) return;
    
    try {
      setIsRunning(true);
      setProgress(0);
      setVisitedCount(0);
      setCurrentSite('');
      
      await startCookieBot(profile.id, config);
      toast.info(t('cookieBot.started', { name: profile.name }));
    } catch (error: any) {
      setIsRunning(false);
      toast.error(`Ошибка: ${error.message}`);
    }
  };

  const handleStop = async () => {
    if (!profile) return;
    
    try {
      await stopCookieBot(profile.id);
      setIsRunning(false);
      toast.info(t('cookieBot.stopped'));
    } catch (error: any) {
      toast.error(`Ошибка: ${error.message}`);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !isRunning && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cookie className="w-5 h-5 text-amber-500" />
            {t('cookieBot.title')}
          </DialogTitle>
          <DialogDescription>
            {t('cookieBot.description', { name: profile.name })}
          </DialogDescription>
        </DialogHeader>

        {isRunning ? (
          /* Прогресс работы */
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t('cookieBot.visited', { current: String(visitedCount), total: String(siteList.length) })}</span>
                <span className="font-mono text-blue-600">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
            
            {currentSite && (
              <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                <Globe className="w-4 h-4 text-blue-500 animate-pulse" />
                <span className="truncate">{currentSite}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>{t('cookieBot.timePerSite', { seconds: String(config.timePerSite) })}</span>
            </div>
          </div>
        ) : (
          /* Настройки */
          <div className="space-y-4 py-4">
            {/* Категории */}
            <div>
              <p className="text-sm font-medium mb-2">{t('cookieBot.categories')}</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <Badge
                    key={cat.id}
                    variant={config.categories.includes(cat.id) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleCategory(cat.id)}
                  >
                    {cat.name} ({cat.count})
                  </Badge>
                ))}
              </div>
            </div>

            {/* Время на сайт */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">{t('cookieBot.timeLabel')}</p>
                <span className="text-sm text-gray-500">{t('cookieBot.timeSec', { seconds: String(config.timePerSite) })}</span>
              </div>
              <Slider
                value={[config.timePerSite]}
                onValueChange={([v]) => setConfig(prev => ({ ...prev, timePerSite: v }))}
                min={3}
                max={30}
                step={1}
              />
            </div>

            {/* Сайтов из категории */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">{t('cookieBot.sitesPerCategory')}</p>
                <span className="text-sm text-gray-500">{config.sitesPerCategory}</span>
              </div>
              <Slider
                value={[config.sitesPerCategory]}
                onValueChange={([v]) => setConfig(prev => ({ ...prev, sitesPerCategory: v }))}
                min={1}
                max={7}
                step={1}
              />
            </div>

            {/* Опции */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.scrollPages}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, scrollPages: !!v }))}
                />
                {t('cookieBot.scrollPages')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.clickLinks}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, clickLinks: !!v }))}
                />
                {t('cookieBot.clickLinks')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.randomOrder}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, randomOrder: !!v }))}
                />
                {t('cookieBot.randomOrder')}
              </label>
            </div>

            {/* Расширенные настройки */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-gray-500"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Settings2 className="w-4 h-4 mr-1" />
              {showAdvanced ? t('cookieBot.hideAdvanced') : t('cookieBot.customSites')}
            </Button>

            {showAdvanced && (
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('cookieBot.customUrlsHint')}</p>
                <Textarea
                  placeholder="https://example.com&#10;https://another-site.com"
                  rows={3}
                  value={config.customSites.join('\n')}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    customSites: e.target.value.split('\n').filter(s => s.trim())
                  }))}
                />
              </div>
            )}

            {/* Итого */}
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
              <div className="flex items-center justify-between">
                <span>{t('cookieBot.totalSites')} <strong>{siteList.length}</strong></span>
                <span>{t('cookieBot.time')} <strong>{eta}</strong></span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="w-4 h-4 mr-2" />
              {t('cookieBot.stop')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleStart}
                disabled={siteList.length === 0}
                className="bg-amber-500 hover:bg-amber-600"
              >
                <Play className="w-4 h-4 mr-2" />
                {t('cookieBot.start', { count: String(siteList.length) })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
