import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extendedGuides, type ExtendedGuide } from '@/lib/extendedGuides';

interface ExtendedGuideModalProps {
  serviceId: string | null;
  onClose: () => void;
}

export default function ExtendedGuideModal({ serviceId, onClose }: ExtendedGuideModalProps) {
  const guide: ExtendedGuide | undefined = serviceId ? extendedGuides[serviceId] : undefined;

  return (
    <AnimatePresence>
      {serviceId && guide && (
        <motion.div
          key="ext-guide-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            key="ext-guide-panel"
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl border border-gray-200 bg-white shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-600">
                <BookOpen className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-foreground tracking-tight flex-1 min-w-0 truncate">
                {guide.title}
              </h2>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-200" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {guide.headerImage && (
                <img
                  src={guide.headerImage}
                  alt={guide.title}
                  className="w-full rounded-xl object-contain max-h-56"
                  loading="lazy"
                />
              )}
              {guide.sections.map((section, si) => (
                <section key={si}>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold">
                      {si + 1}
                    </span>
                    {section.title}
                  </h3>
                  <div className="space-y-2 pl-7">
                    {section.paragraphs.map((p, pi) => (
                      <p key={pi} className="text-[13px] text-foreground/70 leading-relaxed whitespace-pre-line">
                        {p}
                      </p>
                    ))}
                    {section.imageUrl && (
                      <img
                        src={section.imageUrl}
                        alt={section.imageAlt || section.title}
                        className="w-full rounded-lg object-contain mt-2"
                        loading="lazy"
                      />
                    )}
                  </div>
                </section>
              ))}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 bg-gray-50/60">
              <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
