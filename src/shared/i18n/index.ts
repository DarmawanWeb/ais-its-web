import i18n, { type Resource, type ResourceKey } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { appConfig } from '@/shared/config/env';

import commonEn from './locales/en/common.json';
import commonId from './locales/id/common.json';

/** Languages of the UI; Bahasa Indonesia is the default. */
export const APP_LANGUAGES = ['id', 'en'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'id';
const STORAGE_KEY = 'ais-lang';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return APP_LANGUAGES.some((language) => language === value);
}

function initialLanguage(): AppLanguage {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isAppLanguage(stored)) return stored;
  } catch {
    // storage unavailable (private mode): fall back to the configured default
  }
  return isAppLanguage(appConfig.defaultLocale) ? appConfig.defaultLocale : DEFAULT_LANGUAGE;
}

const resources: Resource = {
  id: { common: commonId },
  en: { common: commonEn },
};

/**
 * Development and e2e builds report keys that exist in no language (a typo, a wrong namespace)
 * as `[i18n] missing key <ns>:<key>` warnings; the e2e role walkthrough fails on them. Optional
 * lookups with a `defaultValue` are not reported.
 */
const REPORT_MISSING_KEYS = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...APP_LANGUAGES],
  defaultNS: 'common',
  ns: ['common'],
  fallbackNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
  saveMissing: REPORT_MISSING_KEYS,
  missingKeyHandler: (languages, namespace, key, _fallback, _update, options) => {
    if ((options as { defaultValue?: unknown } | undefined)?.defaultValue !== undefined) return;
    console.warn(`[i18n] missing key ${namespace}:${key} (${languages.join(', ')})`);
  },
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // ignore storage errors
  }
});

/** Translations of a feature namespace: `src/features/<feature>/i18n/{id,en}.json`. */
export interface FeatureTranslations {
  readonly id: ResourceKey;
  readonly en: ResourceKey;
}

/**
 * Registers the translations of a feature under its namespace (the feature id), e.g.
 * `registerFeatureI18n('dashboard', { id, en })` then `useTranslation('dashboard')`.
 * Called by the app for every feature module; safe to call more than once.
 */
export function registerFeatureI18n(namespace: string, translations: FeatureTranslations): void {
  i18n.addResourceBundle('id', namespace, translations.id, true, true);
  i18n.addResourceBundle('en', namespace, translations.en, true, true);
}

/** Current UI language. */
export function currentLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

/**
 * Current UI language in a component (re-renders when it changes). It is also the contracts
 * `Locale` of domain labels: `NAV_STATUS_LABELS[code][useAppLanguage()]`.
 */
export function useAppLanguage(): AppLanguage {
  const { i18n: instance } = useTranslation();
  return instance.language === 'en' ? 'en' : 'id';
}

export function setLanguage(language: AppLanguage): Promise<unknown> {
  return i18n.changeLanguage(language);
}

export { i18n };
