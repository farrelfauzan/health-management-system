import { describe, expect, it } from 'vitest';

import { resolveLoginErrorMessage } from './login-error';

const messages = {
  invalidCredentials: 'Email atau kata sandi tidak valid.',
  loginFailed: 'Tidak dapat masuk saat ini. Silakan coba lagi.',
  throttled: (retryAfterMinutes: number | null): string =>
    retryAfterMinutes === null
      ? 'Terlalu banyak percobaan masuk.'
      : `Terlalu banyak percobaan masuk. Coba lagi dalam ${retryAfterMinutes} menit.`,
};

function buildAxiosError(status: number, data: unknown): Error {
  return Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    response: { status, data },
  });
}

describe('resolveLoginErrorMessage', () => {
  it('maps a 401 response to the invalid-credentials message', () => {
    const inputError = buildAxiosError(401, {
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });

    expect(resolveLoginErrorMessage(inputError, messages)).toBe(messages.invalidCredentials);
  });

  it('tells a throttled user how long to wait, rounded up to whole minutes', () => {
    const inputError = buildAxiosError(429, {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many login attempts. Try again later.',
        details: { retryAfterSeconds: 61 },
      },
    });

    expect(resolveLoginErrorMessage(inputError, messages)).toBe(
      'Terlalu banyak percobaan masuk. Coba lagi dalam 2 menit.',
    );
  });

  it('still names the throttle when the API sends no wait', () => {
    const inputError = buildAxiosError(429, {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again later.' },
    });

    expect(resolveLoginErrorMessage(inputError, messages)).toBe('Terlalu banyak percobaan masuk.');
  });

  it('uses localized safe copy for other failures', () => {
    const inputError = buildAxiosError(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Upstream down' },
    });

    expect(resolveLoginErrorMessage(inputError, messages)).toBe(messages.loginFailed);
  });

  it('falls back to the generic message for network errors', () => {
    expect(resolveLoginErrorMessage(new Error('Network Error'), messages)).toBe(
      messages.loginFailed,
    );
  });
});
