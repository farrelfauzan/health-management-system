'use server';

import { cookies } from 'next/headers';

import {
  isAppLocale,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
} from '../../i18n/config';

export async function setLocale(value: string): Promise<void> {
  if (!isAppLocale(value)) {
    throw new Error('Unsupported locale');
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, value, {
    httpOnly: true,
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
