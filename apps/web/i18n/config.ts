export const APP_LOCALES = ['id', 'en'] as const;
export const DEFAULT_APP_LOCALE = 'id';
export const LOCALE_COOKIE_NAME = 'HMS_LOCALE';
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && APP_LOCALES.some((locale) => locale === value);
}

export function resolveAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_APP_LOCALE;
}
