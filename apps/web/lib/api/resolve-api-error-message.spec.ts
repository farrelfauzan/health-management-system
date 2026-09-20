import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { resolveApiErrorMessage } from './resolve-api-error-message';

const FALLBACK = 'Something went wrong.';

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

describe('resolveApiErrorMessage', () => {
  it('reads the message from the api error envelope', () => {
    const inputError = buildAxiosError({
      error: { code: 'BAD_REQUEST', message: 'Envelope message' },
    });

    expect(resolveApiErrorMessage(inputError, FALLBACK)).toBe('Envelope message');
  });

  it('reads the message from the flat nest exception shape', () => {
    const inputError = buildAxiosError({
      message: 'Doctor is not available at the requested time',
      error: 'Bad Request',
      statusCode: 400,
    });

    expect(resolveApiErrorMessage(inputError, FALLBACK)).toBe(
      'Doctor is not available at the requested time',
    );
  });

  it('joins array messages from validation errors', () => {
    const inputError = buildAxiosError({
      message: ['patientId must be a UUID', 'scheduledAt must be a datetime'],
      error: 'Bad Request',
      statusCode: 400,
    });

    expect(resolveApiErrorMessage(inputError, FALLBACK)).toBe(
      'patientId must be a UUID, scheduledAt must be a datetime',
    );
  });

  it('states the rule each field broke instead of the generic validation message', () => {
    const inputError = buildAxiosError({
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: [
          { code: 'custom', message: 'NITKU must be 22 digits', path: ['nitku'] },
          { code: 'custom', message: 'PKP date is required', path: ['pkpSince'] },
        ],
      },
    });

    expect(resolveApiErrorMessage(inputError, FALLBACK)).toBe(
      'NITKU must be 22 digits; PKP date is required',
    );
  });

  it('keeps the envelope message when details carry no field messages', () => {
    const inputError = buildAxiosError({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Try again later',
        details: { retryAfterSeconds: 30 },
      },
    });

    expect(resolveApiErrorMessage(inputError, FALLBACK)).toBe('Try again later');
  });

  it('falls back when the response has no message', () => {
    const inputError = buildAxiosError({ statusCode: 500 });

    expect(resolveApiErrorMessage(inputError, FALLBACK)).toBe(FALLBACK);
  });

  it('uses the error message for non-axios errors', () => {
    expect(resolveApiErrorMessage(new Error('Plain failure'), FALLBACK)).toBe('Plain failure');
  });
});
