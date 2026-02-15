// Lightweight i18n system for AEZAKMI Pro
// Supports 'ru' and 'en' locales without heavy dependencies

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ru } from '@/locales/ru';
import type { TranslationKeys } from '@/locales/ru';
import { en } from '@/locales/en';

export type Locale = 'ru' | 'en';

const translations: Record<Locale, TranslationKeys> = { ru, en };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getNestedValue(obj: any, path: string): string | undefined {
  return path.split('.').reduce((acc, part) => acc?.[part], obj) as string | undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('aezakmi_locale');
    if (saved === 'en' || saved === 'ru') return saved;
    return 'ru';
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('aezakmi_locale', l);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let value = getNestedValue(translations[locale], key);
    if (value === undefined) {
      // Fallback to Russian
      value = getNestedValue(translations['ru'], key);
    }
    if (value === undefined) return key;

    // Simple template interpolation: {name} → params.name
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value!.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return value;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
}
