import { useState, useEffect, useCallback, useRef } from 'react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import { readFile as tauriReadFile } from '@tauri-apps/plugin-fs';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2, ExternalLink, RotateCcw, ChevronLeft, ChevronRight,
  PartyPopper, Sparkles, BookOpen, Wrench, Copy, ArrowLeft,
  Upload, X, Image as ImageIcon, FileText, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import sxorgLogo from '@/assets/sxorg-logo.svg';
import { getSXOrgApiKey } from '@/lib/sxorg-api';
import ExtendedGuideModal from '@/components/ExtendedGuideModal';
import { extendedGuides } from '@/lib/extendedGuides';
import {
  checklistSteps,
  ChecklistService,
  ChecklistProgress,
  loadChecklistProgress,
  saveChecklistProgress,
} from '@/lib/checklistData';

/* ── props ── */
interface ChecklistGuideProps {
  onOpenSXOrg?: () => void;
}

/* ── confetti ── */
interface Particle { id: number; x: number; y: number; color: string; angle: number; speed: number; size: number }
const CONFETTI_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

const ConfettiBurst = ({ active }: { active: boolean }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  useEffect(() => {
    if (!active) return;
    const p: Particle[] = [];
    for (let i = 0; i < 40; i++) {
      p.push({
        id: i, x: 50 + (Math.random() - 0.5) * 20, y: 50,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        angle: Math.random() * Math.PI * 2, speed: 2 + Math.random() * 4, size: 4 + Math.random() * 6,
      });
    }
    setParticles(p);
    const t = setTimeout(() => setParticles([]), 1200);
    return () => clearTimeout(t);
  }, [active]);

  if (!particles.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: `${p.x}vw`, y: `${p.y}vh`, opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            x: `${p.x + Math.cos(p.angle) * p.speed * 15}vw`,
            y: `${p.y + Math.sin(p.angle) * p.speed * 10 - 30}vh`,
            opacity: 0, scale: 0.3, rotate: Math.random() * 720 - 360,
          }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="absolute rounded-sm"
          style={{ width: p.size, height: p.size, background: p.color }}
        />
      ))}
    </div>
  );
};

/* ── Favicon ── */
const Favicon = ({ service, size = 32 }: { service: ChecklistService; size?: number }) => {
  const [ok, setOk] = useState(true);
  if (service.domain && ok) {
    return (
      <div className="flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center ring-1 ring-gray-200"
        style={{ width: size, height: size }}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(service.domain)}&sz=64`}
          alt="" width={size - 4} height={size - 4} className="object-contain"
          onError={() => setOk(false)} loading="lazy"
        />
      </div>
    );
  }
  return (
    <div className="flex-shrink-0 rounded-xl flex items-center justify-center font-extrabold text-white ring-1 ring-gray-200"
      style={{ width: size, height: size, background: service.brandColor, fontSize: size * 0.36 }}>
      {service.brandLetter}
    </div>
  );
};

/* ── Service card ── */
const ServiceCard = ({
  service, stepColor, index, locale, l, lArr, onOpenSXOrg, onOpenGuide,
}: {
  service: ChecklistService; stepColor: string; index: number; locale: string;
  l: (o: { ru: string; en: string }) => string;
  lArr: (o: { ru: string[]; en: string[] }) => string[];
  onOpenSXOrg?: () => void;
  onOpenGuide?: (serviceId: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
      className="group"
    >
      <div
        className={cn(
          'relative rounded-2xl border backdrop-blur-md transition-all duration-300 cursor-pointer overflow-hidden',
          'border-gray-200 bg-white',
          'hover:border-gray-300 hover:bg-gray-50 hover:shadow-lg hover:shadow-gray-300/40',
          expanded && 'border-gray-300 bg-white shadow-xl shadow-gray-300/40',
        )}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `linear-gradient(90deg, transparent, ${stepColor}60, transparent)` }} />

        <div className="flex items-center gap-3.5 p-4">
          <Favicon service={service} size={40} />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground tracking-tight">{service.name}</h4>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{l(service.description)}</p>
          </div>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="text-muted-foreground/50">
            <ChevronRight className="w-4 h-4 rotate-90" />
          </motion.div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-4 pb-4 space-y-3">
                <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                <div className="flex gap-2 flex-wrap">
                  {service.isSXOrgIntegration && onOpenSXOrg ? (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 font-semibold"
                      onClick={onOpenSXOrg}>
                      <img src={sxorgLogo} alt="" className="h-3.5 w-auto mr-1.5" />
                      {locale === 'ru' ? 'Открыть SX.ORG' : 'Open SX.ORG'}
                    </Button>
                  ) : service.url ? (
                    <Button size="sm" className="text-white font-semibold shadow-md"
                      style={{ background: stepColor, boxShadow: `0 2px 12px ${stepColor}40` }}
                      onClick={() => shellOpen(service.url)}>
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      {locale === 'ru' ? 'Перейти на сайт' : 'Visit site'}
                    </Button>
                  ) : null}
                  {onOpenGuide && extendedGuides[service.id] && (
                    <Button size="sm" variant="outline"
                      className="border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold"
                      onClick={() => onOpenGuide(service.id)}>
                      <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                      {locale === 'ru' ? 'Расширенный гайд' : 'Extended Guide'}
                    </Button>
                  )}
                </div>
                <ol className="space-y-2">
                  {lArr(service.instruction).map((text, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5 shadow-sm"
                        style={{ background: stepColor }}>{i + 1}</span>
                      <span className="text-[13px] text-foreground/70 leading-relaxed">{text}</span>
                    </motion.li>
                  ))}
                </ol>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

/* ── In-app Guide Panel ── */
const GuidePanel = ({
  guide, stepColor, locale,
}: {
  guide: string[];
  stepColor: string;
  locale: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="overflow-hidden"
    >
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4" style={{ color: stepColor }} />
          <span className="text-xs font-semibold text-foreground">
            {locale === 'ru' ? 'Гайд по этапу' : 'Step Guide'}
          </span>
        </div>
        <div className="space-y-2.5">
          {guide.map((paragraph, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="text-[13px] text-foreground/70 leading-relaxed"
            >
              {paragraph}
            </motion.p>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

/* ── Image Upload Section ── */
const ImageUploadSection = ({
  images, onAdd, onRemove, stepColor, locale,
}: {
  images: string[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  stepColor: string;
  locale: string;
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-foreground/80 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          {locale === 'ru' ? 'Креативы' : 'Creatives'}
          {images.length > 0 && (
            <span className="text-[10px] text-muted-foreground">({images.length})</span>
          )}
        </label>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-white transition-colors"
          style={{ background: stepColor }}
        >
          <Upload className="w-3 h-3" />
          {locale === 'ru' ? 'Загрузить' : 'Upload'}
        </button>
      </div>
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((src, i) => (
            <div key={i} className="relative group rounded-xl overflow-hidden border border-gray-200 w-16 h-16">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {images.length === 0 && (
        <button
          onClick={onAdd}
          className="w-full py-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-muted-foreground hover:text-foreground/60 transition-colors flex flex-col items-center gap-1.5"
        >
          <Upload className="w-5 h-5" />
          <span className="text-[11px]">{locale === 'ru' ? 'Нажми для загрузки изображений' : 'Click to upload images'}</span>
        </button>
      )}
    </div>
  );
};

/* ── Cookie Upload Section ── */
const CookieUploadSection = ({
  cookieFilename, onUpload, onRemove, stepColor, locale,
}: {
  cookieFilename?: string;
  onUpload: () => void;
  onRemove: () => void;
  stepColor: string;
  locale: string;
}) => {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-foreground/80 flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5" />
        {locale === 'ru' ? 'Куки аккаунта (из магазина)' : 'Account Cookies (from shop)'}
      </label>
      {cookieFilename ? (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2">
          <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-medium flex-1 truncate">{cookieFilename}</span>
          <button
            onClick={onRemove}
            className="p-1 rounded-md text-muted-foreground hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={onUpload}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-muted-foreground hover:text-foreground/60 transition-colors flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          <span className="text-[11px]">{locale === 'ru' ? 'Загрузить файл куки (.json / .txt)' : 'Upload cookie file (.json / .txt)'}</span>
        </button>
      )}
    </div>
  );
};

/* ── Proxy Status Indicator ── */
const ProxyStatus = ({ hasApiKey, locale, onOpenSXOrg }: { hasApiKey: boolean; locale: string; onOpenSXOrg?: () => void }) => (
  <div className={cn(
    'flex items-center gap-2 rounded-xl px-3 py-2.5 border',
    hasApiKey
      ? 'bg-green-50 border-green-200'
      : 'bg-amber-50 border-amber-200',
  )}>
    {hasApiKey ? (
      <>
        <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span className="text-xs font-medium text-green-700">
          {locale === 'ru' ? 'Настроено' : 'Configured'}
        </span>
      </>
    ) : (
      <>
        <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="text-xs font-medium text-amber-700 flex-1">
          {locale === 'ru' ? 'Требует настройки' : 'Needs setup'}
        </span>
        {onOpenSXOrg && (
          <button
            onClick={onOpenSXOrg}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
          >
            <img src={sxorgLogo} alt="" className="h-3 w-auto" />
            {locale === 'ru' ? 'Настроить' : 'Configure'}
          </button>
        )}
      </>
    )}
  </div>
);

/* ── My Tools panel ── */
const MyToolsPanel = ({
  progress, locale, l, onBack,
}: {
  progress: ChecklistProgress;
  locale: string;
  l: (o: { ru: string; en: string }) => string;
  onBack: () => void;
}) => {
  const entries = checklistSteps
    .filter(s => progress[s.id]?.completed)
    .map(s => ({
      step: s,
      value: progress[s.id].value,
      completedAt: progress[s.id].completedAt,
      images: progress[s.id].images,
      cookieData: progress[s.id].cookieData,
      cookieFilename: progress[s.id].cookieFilename,
    }));

  const copyValue = (val: string) => {
    navigator.clipboard.writeText(val);
    toast.success(locale === 'ru' ? 'Скопировано!' : 'Copied!');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="h-full flex flex-col"
    >
      <div className="flex-shrink-0 px-6 pt-5 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {locale === 'ru' ? 'Назад к чеклисту' : 'Back to checklist'}
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Wrench className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              {locale === 'ru' ? 'Мои инструменты' : 'My Tools'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {locale === 'ru' ? 'Все данные из пройденных этапов' : 'All data from completed steps'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
            <Wrench className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {locale === 'ru'
                ? 'Пройди этапы чеклиста и вводи данные — они появятся здесь'
                : 'Complete checklist steps and enter data — they will appear here'}
            </p>
          </div>
        ) : (
          entries.map((entry, i) => (
            <motion.div
              key={entry.step.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 28 }}
              className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: entry.step.color }}>
                  {entry.step.number}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{l(entry.step.title)}</span>
                  {entry.step.inputLabel && (
                    <p className="text-[10px] text-muted-foreground">{l(entry.step.inputLabel)}</p>
                  )}
                </div>
                <span className="text-lg">{entry.step.icon}</span>
              </div>

              {/* Text value */}
              {entry.value && (
                <div className="flex items-center gap-2 rounded-lg bg-gray-100 border border-gray-200 px-3 py-2">
                  <code className="flex-1 text-xs text-foreground font-mono truncate">{entry.value}</code>
                  <button
                    onClick={() => copyValue(entry.value!)}
                    className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Card autofill indicator */}
              {entry.step.id === 'cards' && entry.value && entry.value.replace(/\s+/g, '').length >= 13 && (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5">
                  <span className="text-sm">💳</span>
                  <span className="text-[11px] text-indigo-700 font-medium">
                    {locale === 'ru' ? 'Карта + срок + CVV будут предложены в браузере' : 'Card + expiry + CVV will be offered in browser'}
                  </span>
                </div>
              )}

              {/* Proxy status */}
              {entry.step.isProxyStep && (
                <ProxyStatus hasApiKey={!!getSXOrgApiKey()} locale={locale} />
              )}

              {/* Uploaded images */}
              {entry.images && entry.images.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    {locale === 'ru' ? 'Креативы' : 'Creatives'} ({entry.images.length})
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    {entry.images.map((src, j) => (
                      <div key={j} className="rounded-lg overflow-hidden border border-gray-200 w-14 h-14">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Uploaded cookies */}
              {entry.cookieFilename && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5">
                  <FileText className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                  <span className="text-[11px] text-green-700 font-medium truncate">{entry.cookieFilename}</span>
                  {entry.cookieData && (
                    <button
                      onClick={() => copyValue(entry.cookieData!)}
                      className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {entry.completedAt && (
                <p className="text-[10px] text-muted-foreground/60">
                  {new Date(entry.completedAt).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};

/* ════════════════════════════════════════════════════════
   MAIN — ChecklistGuide
   ════════════════════════════════════════════════════════ */
const ChecklistGuide = ({ onOpenSXOrg }: ChecklistGuideProps) => {
  const { locale } = useTranslation();
  const l = (o: { ru: string; en: string }) => o[locale] || o.ru;
  const lArr = (o: { ru: string[]; en: string[] }) => o[locale] || o.ru;

  const [progress, setProgress] = useState<ChecklistProgress>(loadChecklistProgress);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [stepImages, setStepImages] = useState<Record<string, string[]>>({});
  const [stepCookies, setStepCookies] = useState<Record<string, { data: string; filename: string }>>({});
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [activeCat, setActiveCat] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [sxOrgConfigured, setSxOrgConfigured] = useState(false);
  const [extGuideServiceId, setExtGuideServiceId] = useState<string | null>(null);
  const confettiTimer = useRef<ReturnType<typeof setTimeout>>();

  const current = checklistSteps[step];
  const total = checklistSteps.length;
  const completedCount = checklistSteps.filter(s => progress[s.id]?.completed).length;
  const done = progress[current.id]?.completed;
  const savedDataCount = checklistSteps.filter(s => progress[s.id]?.completed).length;

  useEffect(() => { saveChecklistProgress(progress); }, [progress]);

  useEffect(() => { setSxOrgConfigured(!!getSXOrgApiKey()); }, []);

  useEffect(() => {
    const v: Record<string, string> = {};
    const imgs: Record<string, string[]> = {};
    const cks: Record<string, { data: string; filename: string }> = {};
    checklistSteps.forEach(s => {
      const p = progress[s.id];
      if (p?.value) v[s.id] = p.value;
      if (p?.images) imgs[s.id] = p.images;
      if (p?.cookieData && p?.cookieFilename) cks[s.id] = { data: p.cookieData, filename: p.cookieFilename };
    });
    setInputValues(v);
    setStepImages(imgs);
    setStepCookies(cks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setActiveCat(0); setShowGuide(false); }, [step]);

  const goTo = useCallback((idx: number) => {
    setDir(idx > step ? 1 : -1);
    setStep(idx);
  }, [step]);

  const next = useCallback(() => { if (step < total - 1) goTo(step + 1); }, [step, total, goTo]);
  const prev = useCallback(() => { if (step > 0) goTo(step - 1); }, [step, goTo]);

  /* ── Image upload via Tauri dialog ── */
  const handleImageUpload = async () => {
    try {
      const selected = await dialogOpen({
        multiple: true,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const newImages: string[] = [];
      for (const filePath of paths) {
        const bytes = await tauriReadFile(filePath);
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
          : 'image/png';
        let binary = '';
        const len = bytes.length;
        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        newImages.push(`data:${mime};base64,${b64}`);
      }
      setStepImages(prev => ({
        ...prev,
        [current.id]: [...(prev[current.id] || []), ...newImages],
      }));
      toast.success(locale === 'ru' ? `Загружено ${newImages.length} креатив(ов)` : `Uploaded ${newImages.length} creative(s)`);
    } catch (e) {
      console.error('Image upload error:', e);
    }
  };

  const handleImageRemove = (idx: number) => {
    setStepImages(prev => ({
      ...prev,
      [current.id]: (prev[current.id] || []).filter((_, i) => i !== idx),
    }));
  };

  /* ── Cookie upload via Tauri dialog ── */
  const handleCookieUpload = async () => {
    try {
      const selected = await dialogOpen({
        multiple: false,
        filters: [{ name: 'Cookies', extensions: ['json', 'txt'] }],
      });
      if (!selected) return;
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      const bytes = await tauriReadFile(filePath);
      const decoder = new TextDecoder('utf-8');
      const content = decoder.decode(bytes);
      const filename = filePath.split(/[\\/]/).pop() || 'cookies.json';
      setStepCookies(prev => ({
        ...prev,
        [current.id]: { data: content, filename },
      }));
      toast.success(locale === 'ru' ? `Куки загружены: ${filename}` : `Cookies loaded: ${filename}`);
    } catch (e) {
      console.error('Cookie upload error:', e);
    }
  };

  const handleCookieRemove = () => {
    setStepCookies(prev => {
      const u = { ...prev };
      delete u[current.id];
      return u;
    });
  };

  const completeStep = () => {
    setProgress(prev => ({
      ...prev,
      [current.id]: {
        completed: true,
        value: inputValues[current.id] || '',
        completedAt: new Date().toISOString(),
        images: stepImages[current.id] || undefined,
        cookieData: stepCookies[current.id]?.data || undefined,
        cookieFilename: stepCookies[current.id]?.filename || undefined,
      },
    }));

    // Если это шаг "Виртуальные карты" и введён номер карты — сохраняем для автозаполнения
    if (current.id === 'cards' && inputValues[current.id]) {
      const cardNumber = inputValues[current.id].replace(/\s+/g, '');
      if (cardNumber.length >= 13) {
        try {
          const raw = localStorage.getItem('aezakmi_saved_cards');
          const cards = raw ? JSON.parse(raw) : [];
          const exists = cards.some((c: any) => (c['cc-number'] || '').replace(/\s+/g, '') === cardNumber);
          if (!exists) {
            const expParts = (inputValues['card-exp'] || '').split('/');
            const expMonth = parseInt(expParts[0]) || 0;
            const expYear = expParts[1] ? (parseInt(expParts[1]) < 100 ? 2000 + parseInt(expParts[1]) : parseInt(expParts[1])) : 0;
            const card: any = { 'cc-number': cardNumber };
            if (inputValues['card-name']) card['cc-name'] = inputValues['card-name'];
            if (expMonth) card['cc-exp-month'] = expMonth;
            if (expYear) card['cc-exp-year'] = expYear;
            if (inputValues['card-cvv']) card['cc-csc'] = inputValues['card-cvv'];
            cards.push(card);
            localStorage.setItem('aezakmi_saved_cards', JSON.stringify(cards));
          }
        } catch { /* ignore */ }
      }
    }

    setConfetti(true);
    clearTimeout(confettiTimer.current);
    confettiTimer.current = setTimeout(() => setConfetti(false), 100);
    toast.success(l(current.title), {
      description: locale === 'ru' ? 'Этап завершён! 🎉' : 'Step completed! 🎉',
    });
    if (step < total - 1) {
      setTimeout(() => next(), 600);
    }
  };

  const resetStep = (stepId: string) => {
    setProgress(prev => { const u = { ...prev }; delete u[stepId]; return u; });
    setStepImages(prev => { const u = { ...prev }; delete u[stepId]; return u; });
    setStepCookies(prev => { const u = { ...prev }; delete u[stepId]; return u; });
  };

  const resetAll = () => {
    setProgress({});
    setStepImages({});
    setStepCookies({});
    setInputValues({});
    toast.info(locale === 'ru' ? 'Прогресс сброшен' : 'Progress reset');
  };

  const getVisibleServices = (): ChecklistService[] => {
    if (current.categories && current.categories.length > 0) {
      return current.categories[activeCat]?.services || [];
    }
    return current.services || [];
  };

  const slideVars = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  /* ── My Tools view ── */
  if (showTools) {
    return (
      <div className="relative h-full flex flex-col overflow-hidden bg-gray-100">
        <AnimatePresence mode="wait">
          <MyToolsPanel
            key="tools"
            progress={progress}
            locale={locale}
            l={l}
            onBack={() => setShowTools(false)}
          />
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col overflow-hidden bg-gray-100">
      <ConfettiBurst active={confetti} />

      {/* ── top bar ── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {locale === 'ru' ? 'Чеклист по заливу' : 'Media Buying Checklist'}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === 'ru' ? 'Пошаговое руководство' : 'Step-by-step guide'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowTools(true)}
            className={cn(
              'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-gray-200/60',
            )}
          >
            <Wrench className="w-3.5 h-3.5" />
            {locale === 'ru' ? 'Инструменты' : 'Tools'}
            {savedDataCount > 0 && (
              <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center">
                {savedDataCount}
              </span>
            )}
          </button>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {completedCount}/{total}
          </span>
          {completedCount > 0 && (
            <button onClick={resetAll}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── stepper dots ── */}
      <div className="flex-shrink-0 px-6 pb-4">
        <div className="relative flex items-center justify-between">
          <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-gray-300 rounded-full" />
          <motion.div
            className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 rounded-full"
            style={{ background: current.color }}
            initial={false}
            animate={{ width: `${(step / (total - 1)) * 100}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          />

          {checklistSteps.map((s, i) => {
            const isDone = progress[s.id]?.completed;
            const isActive = i === step;
            const isReachable = i <= step || isDone;
            return (
              <button key={s.id} onClick={() => goTo(i)}
                className="relative z-10 flex flex-col items-center gap-1.5 group">
                <motion.div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-300',
                    isDone ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                      : isActive ? 'text-white shadow-lg'
                      : isReachable ? 'bg-gray-200 text-foreground/60 hover:bg-gray-300'
                      : 'bg-gray-200 text-gray-400',
                  )}
                  style={isActive && !isDone ? { background: s.color, boxShadow: `0 4px 20px ${s.color}40` } : {}}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : s.number}
                </motion.div>
                {isActive && (
                  <motion.div className="absolute w-8 h-8 rounded-full"
                    style={{ border: `2px solid ${isDone ? '#22c55e' : s.color}` }}
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }} />
                )}
                <AnimatePresence>
                  {isActive && (
                    <motion.span
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="absolute -bottom-5 text-[9px] font-medium whitespace-nowrap"
                      style={{ color: isDone ? '#22c55e' : s.color }}>{s.icon}</motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── main content ── */}
      <div className="flex-1 overflow-hidden relative px-6 pb-4">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${current.color}, transparent)` }} />

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={current.id} custom={dir} variants={slideVars}
            initial="enter" animate="center" exit="exit"
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="h-full flex flex-col"
          >
            {/* step header */}
            <div className="flex-shrink-0 mb-3">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl">{current.icon}</span>
                <h3 className="text-base font-bold text-foreground tracking-tight flex-1">
                  {l(current.title)}
                </h3>
                {done && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </motion.div>
                )}
                {current.guide && (
                  <button
                    onClick={() => setShowGuide(v => !v)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all',
                      showGuide
                        ? 'text-white shadow-md'
                        : 'text-foreground/80 bg-white hover:bg-gray-50 border border-gray-200',
                    )}
                    style={showGuide ? { background: current.color, boxShadow: `0 2px 10px ${current.color}40` } : {}}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {locale === 'ru' ? 'Гайд' : 'Guide'}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{l(current.subtitle)}</p>
            </div>

            {/* in-app guide panel */}
            <AnimatePresence>
              {showGuide && current.guide && (
                <GuidePanel
                  guide={locale === 'ru' ? current.guide.ru : (current.guide.en || current.guide.ru)}
                  stepColor={current.color}
                  locale={locale}
                />
              )}
            </AnimatePresence>

            {/* category tabs */}
            {current.categories && current.categories.length > 1 && (
              <div className="flex-shrink-0 flex gap-1 mb-3 pb-1 overflow-x-auto scrollbar-none">
                {current.categories.map((cat, ci) => (
                  <button key={cat.id} onClick={() => setActiveCat(ci)}
                    className={cn(
                      'relative px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                      ci === activeCat ? 'text-white' : 'text-muted-foreground hover:text-foreground hover:bg-gray-100',
                    )}>
                    {ci === activeCat && (
                      <motion.div layoutId="catTab" className="absolute inset-0 rounded-lg"
                        style={{ background: current.color }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <span>{cat.icon}</span>
                      {l(cat.name)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* service cards */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300 space-y-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${current.id}-${activeCat}`}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                  className="space-y-2">
                  {getVisibleServices().map((s, i) => (
                    <ServiceCard key={s.id} service={s} stepColor={current.color} index={i}
                      locale={locale} l={l} lArr={lArr} onOpenSXOrg={onOpenSXOrg}
                      onOpenGuide={setExtGuideServiceId} />
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* bottom bar: input / uploads / status / complete */}
            <div className="flex-shrink-0 mt-3 pt-3 border-t border-gray-200 space-y-2.5">

              {/* Proxy status indicator */}
              {current.isProxyStep && (
                <ProxyStatus hasApiKey={sxOrgConfigured} locale={locale} onOpenSXOrg={onOpenSXOrg} />
              )}

              {/* Regular input field */}
              {current.inputLabel && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground/80">{l(current.inputLabel)}</label>
                  <div className="relative">
                    <Input
                      value={inputValues[current.id] || ''}
                      onChange={e => setInputValues(prev => ({ ...prev, [current.id]: e.target.value }))}
                      placeholder={current.inputPlaceholder ? l(current.inputPlaceholder) : ''}
                      className="h-8 text-xs bg-white border border-gray-300 rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                      style={inputValues[current.id] ? { borderColor: current.color + '50' } : undefined}
                    />
                    {inputValues[current.id] && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500/60" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Card detail fields: name + expiry + CVV */}
              {current.id === 'cards' && inputValues[current.id] && inputValues[current.id].replace(/\s+/g, '').length >= 13 && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground/80">
                      {locale === 'ru' ? 'Имя на карте' : 'Name on card'}
                    </label>
                    <Input
                      value={inputValues['card-name'] || ''}
                      onChange={e => setInputValues(prev => ({ ...prev, 'card-name': e.target.value }))}
                      placeholder="IVAN IVANOV"
                      className="h-8 text-xs bg-white border border-gray-300 rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-[11px] font-semibold text-foreground/80">
                        {locale === 'ru' ? 'Срок (MM/YY)' : 'Expiry (MM/YY)'}
                      </label>
                      <Input
                        value={inputValues['card-exp'] || ''}
                        onChange={e => {
                          let v = e.target.value.replace(/[^0-9/]/g, '');
                          if (v.length === 2 && !v.includes('/') && !(inputValues['card-exp'] || '').includes('/')) v += '/';
                          if (v.length > 5) v = v.slice(0, 5);
                          setInputValues(prev => ({ ...prev, 'card-exp': v }));
                        }}
                        placeholder="MM/YY"
                        className="h-8 text-xs bg-white border border-gray-300 rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[11px] font-semibold text-foreground/80">CVV</label>
                      <Input
                        value={inputValues['card-cvv'] || ''}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setInputValues(prev => ({ ...prev, 'card-cvv': v }));
                        }}
                        placeholder="123"
                        type="password"
                        className="h-8 text-xs bg-white border border-gray-300 rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Image upload for creatives step */}
              {current.hasImageUpload && (
                <ImageUploadSection
                  images={stepImages[current.id] || []}
                  onAdd={handleImageUpload}
                  onRemove={handleImageRemove}
                  stepColor={current.color}
                  locale={locale}
                />
              )}

              {/* Cookie upload for accounts step */}
              {current.hasCookieUpload && (
                <CookieUploadSection
                  cookieFilename={stepCookies[current.id]?.filename}
                  onUpload={handleCookieUpload}
                  onRemove={handleCookieRemove}
                  stepColor={current.color}
                  locale={locale}
                />
              )}

              <div className="flex items-center gap-2">
                {!done ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={completeStep}
                    className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white overflow-hidden shadow-lg"
                    style={{ background: current.color, boxShadow: `0 4px 20px ${current.color}30` }}>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      initial={{ x: '-100%' }} animate={{ x: '200%' }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 3 }} />
                    <Sparkles className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">
                      {locale === 'ru' ? 'Завершить этап' : 'Complete step'}
                    </span>
                  </motion.button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                      <PartyPopper className="w-3.5 h-3.5" />
                      {locale === 'ru' ? 'Выполнено' : 'Done'}
                    </span>
                    {progress[current.id]?.value && (
                      <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                        — {progress[current.id].value}
                      </span>
                    )}
                    <button onClick={() => resetStep(current.id)}
                      className="ml-2 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── bottom nav ── */}
      <div className="flex-shrink-0 px-6 pb-5 pt-2 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-20">
          <ChevronLeft className="w-4 h-4 mr-1" />
          {locale === 'ru' ? 'Назад' : 'Back'}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums font-medium">
          {step + 1} / {total}
        </span>
        <Button variant="ghost" size="sm" onClick={next} disabled={step === total - 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-20">
          {locale === 'ru' ? 'Далее' : 'Next'}
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* ── all done overlay ── */}
      <AnimatePresence>
        {completedCount === total && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center backdrop-blur-xl bg-background/80">
            <motion.div
              initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="text-center space-y-4 max-w-sm px-6">
              <motion.div animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
                transition={{ duration: 0.6, delay: 0.3 }} className="text-5xl">🎉</motion.div>
              <h3 className="text-xl font-bold text-foreground">
                {locale === 'ru' ? 'Поздравляем!' : 'Congratulations!'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {locale === 'ru'
                  ? 'Все этапы пройдены. Удачи в заливе!'
                  : 'All steps completed. Good luck with your campaigns!'}
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm"
                  onClick={() => { setShowTools(true); }}
                  className="border-violet-500/30 text-violet-600 hover:bg-violet-50">
                  <Wrench className="w-3.5 h-3.5 mr-1.5" />
                  {locale === 'ru' ? 'Мои инструменты' : 'My Tools'}
                </Button>
                <Button variant="outline" size="sm" onClick={resetAll} className="border-gray-200 hover:bg-gray-50">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  {locale === 'ru' ? 'Заново' : 'Restart'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extended guide modal */}
      <ExtendedGuideModal serviceId={extGuideServiceId} onClose={() => setExtGuideServiceId(null)} />
    </div>
  );
};

export default ChecklistGuide;

