import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';

import { resolveAddressChainErrors } from './resolve-address-chain-errors';

function buildValidationError(details: unknown): AxiosError {
  return new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: {},
    data: { error: { code: 'BAD_REQUEST', message: 'Validation failed', details } },
  } as AxiosResponse);
}

describe('resolveAddressChainErrors', () => {
  it('puts a chain mismatch under the level the API named', () => {
    const actual = resolveAddressChainErrors(
      buildValidationError([
        {
          code: 'custom',
          message: 'villageCode does not belong to districtCode 31.71.01',
          path: ['villageCode'],
        },
      ]),
    );

    expect(actual).toEqual({
      villageCode: 'villageCode does not belong to districtCode 31.71.01',
    });
  });

  it('ignores issues on fields outside the address section', () => {
    const actual = resolveAddressChainErrors(
      buildValidationError([{ message: 'Invalid', path: ['phoneNumber'] }]),
    );

    expect(actual).toEqual({});
  });

  it('keeps the first message when a field is named twice', () => {
    const actual = resolveAddressChainErrors(
      buildValidationError([
        { message: 'first', path: ['regencyCode'] },
        { message: 'second', path: ['regencyCode'] },
      ]),
    );

    expect(actual).toEqual({ regencyCode: 'first' });
  });

  it('answers with nothing for a failure that carries no validation details', () => {
    expect(resolveAddressChainErrors(new Error('offline'))).toEqual({});
    expect(resolveAddressChainErrors(buildValidationError(undefined))).toEqual({});
  });
});
