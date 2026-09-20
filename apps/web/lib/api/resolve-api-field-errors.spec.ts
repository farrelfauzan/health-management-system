import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { resolveApiFieldErrors } from './resolve-api-field-errors';

function buildAxiosError(responseData: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
    data: responseData,
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config,
  });
}

describe('resolveApiFieldErrors', () => {
  it('reads the validation pipe issue list, keyed by dotted path', () => {
    const inputError = buildAxiosError({
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: [
          { code: 'custom', message: 'NITKU must be 22 digits', path: ['nitku'] },
          {
            code: 'too_small',
            message: 'Quantity must be at least 1',
            path: ['items', 0, 'quantity'],
          },
        ],
      },
    });

    expect(resolveApiFieldErrors(inputError)).toEqual({
      nitku: 'NITKU must be 22 digits',
      'items.0.quantity': 'Quantity must be at least 1',
    });
  });

  it('reads the field map a service throws, and keeps the first message per field', () => {
    const fromService = buildAxiosError({
      error: {
        code: 'TAX_NITKU_NPWP_MISMATCH',
        message: "The first 16 digits of the NITKU must be the clinic's NPWP",
        details: { nitku: "The first 16 digits of the NITKU must be the clinic's NPWP" },
      },
    });
    const bothShapes = buildAxiosError({
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: [{ message: 'From the pipe', path: ['nitku'] }],
      },
    });

    expect(resolveApiFieldErrors(fromService).nitku).toBe(
      "The first 16 digits of the NITKU must be the clinic's NPWP",
    );
    expect(resolveApiFieldErrors(bothShapes).nitku).toBe('From the pipe');
  });

  it('ignores details that are facts rather than field messages', () => {
    const retryAfter = buildAxiosError({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Slow down',
        details: { retryAfterSeconds: 30 },
      },
    });
    const issueWithoutField = buildAxiosError({
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: [{ message: 'Bad body', path: [] }],
      },
    });

    expect(resolveApiFieldErrors(retryAfter)).toEqual({});
    expect(resolveApiFieldErrors(issueWithoutField)).toEqual({});
    expect(resolveApiFieldErrors(new Error('offline'))).toEqual({});
  });
});
