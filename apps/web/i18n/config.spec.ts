import { describe, expect, it } from 'vitest';

import { DEFAULT_APP_LOCALE, isAppLocale, resolveAppLocale } from './config';

describe('app locale configuration', () => {
  it('uses Bahasa Indonesia when no supported preference exists', () => {
    expect(DEFAULT_APP_LOCALE).toBe('id');
    expect(resolveAppLocale(undefined)).toBe('id');
    expect(resolveAppLocale('')).toBe('id');
    expect(resolveAppLocale('en-US')).toBe('id');
  });

  it('accepts only the supported locale identifiers', () => {
    expect(isAppLocale('id')).toBe(true);
    expect(isAppLocale('en')).toBe(true);
    expect(isAppLocale('ID')).toBe(false);
    expect(resolveAppLocale('en')).toBe('en');
  });
});
