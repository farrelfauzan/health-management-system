import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
} from '../../i18n/config';

const setCookieMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: setCookieMock })),
}));

import { setLocale } from './set-locale';

describe('setLocale', () => {
  beforeEach(() => {
    setCookieMock.mockClear();
  });

  it.each(['id', 'en'])('persists the supported %s locale securely', async (locale) => {
    await setLocale(locale);

    expect(setCookieMock).toHaveBeenCalledWith(LOCALE_COOKIE_NAME, locale, {
      httpOnly: true,
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });

  it('rejects unsupported locale values at the server boundary', async () => {
    await expect(setLocale('en-US')).rejects.toThrow('Unsupported locale');
    expect(setCookieMock).not.toHaveBeenCalled();
  });
});
