import { describe, expect, it } from 'vitest';

import { resolveLoginErrorMessage } from './login-error';

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

    expect(resolveLoginErrorMessage(inputError)).toBe('Invalid email or password.');
  });

  it('surfaces the API error envelope message for non-401 failures', () => {
    const inputError = buildAxiosError(429, {
      error: { code: 'RATE_LIMITED', message: 'Too many login attempts' },
    });

    expect(resolveLoginErrorMessage(inputError)).toBe('Too many login attempts');
  });

  it('falls back to the generic message for network errors', () => {
    expect(resolveLoginErrorMessage(new Error('Network Error'))).toBe(
      'Unable to sign in right now. Please try again.',
    );
  });
});
