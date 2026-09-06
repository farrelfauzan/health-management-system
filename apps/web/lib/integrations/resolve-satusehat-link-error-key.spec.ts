import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { resolveSatusehatLinkErrorKey } from './resolve-satusehat-link-error-key';

function buildAxiosErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError('request failed');
  error.response = {
    status,
    statusText: '',
    data: {},
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('resolveSatusehatLinkErrorKey', () => {
  it.each([
    [422, 'missingNik'],
    [404, 'notFound'],
    [409, 'ambiguous'],
    [503, 'notConfigured'],
    [502, 'unreachable'],
  ])('maps %s to %s', (status, expectedKey) => {
    expect(resolveSatusehatLinkErrorKey(buildAxiosErrorWithStatus(status))).toBe(expectedKey);
  });

  it('falls back to unreachable for an unexpected status', () => {
    expect(resolveSatusehatLinkErrorKey(buildAxiosErrorWithStatus(418))).toBe('unreachable');
  });

  it('falls back to unreachable when the request never reached the network', () => {
    expect(resolveSatusehatLinkErrorKey(new Error('offline'))).toBe('unreachable');
  });
});
