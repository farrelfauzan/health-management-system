import { describe, expect, it } from 'vitest';

import { resolveLoginErrorMessage } from './login-error';

const messages = {
  invalidCredentials: 'Email atau kata sandi tidak valid.',
  loginFailed: 'Tidak dapat masuk saat ini. Silakan coba lagi.',
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

  it('uses localized safe copy for non-401 failures', () => {
    const inputError = buildAxiosError(429, {
      error: { code: 'RATE_LIMITED', message: 'Too many login attempts' },
    });

    expect(resolveLoginErrorMessage(inputError, messages)).toBe(messages.loginFailed);
  });

  it('falls back to the generic message for network errors', () => {
    expect(resolveLoginErrorMessage(new Error('Network Error'), messages)).toBe(
      messages.loginFailed,
    );
  });
});
