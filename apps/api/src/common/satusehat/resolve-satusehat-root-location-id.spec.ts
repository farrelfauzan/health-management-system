import { resolveSatusehatServiceClassCode } from '@hms/shared-types';

import { resolveSatusehatRootLocationId } from './resolve-satusehat-root-location-id';

describe('resolveSatusehatRootLocationId', () => {
  it('keeps using SATUSEHAT_LOCATION_ID while no root is registered, exactly as before', () => {
    expect(
      resolveSatusehatRootLocationId({
        registeredRootLocationId: null,
        configuredLocationId: 'env-location-id',
      }),
    ).toBe('env-location-id');
  });

  it('prefers the registered root site once there is one', () => {
    expect(
      resolveSatusehatRootLocationId({
        registeredRootLocationId: 'registered-site-id',
        configuredLocationId: 'env-location-id',
      }),
    ).toBe('registered-site-id');
  });

  it('returns null when neither is set', () => {
    expect(
      resolveSatusehatRootLocationId({
        registeredRootLocationId: null,
        configuredLocationId: undefined,
      }),
    ).toBeNull();
  });
});

describe('resolveSatusehatServiceClassCode', () => {
  it.each([
    ['CLASS_1', '1'],
    ['CLASS_2', '2'],
    ['CLASS_3', '3'],
    ['VIP', 'vip'],
    ['VVIP', 'vvip'],
  ] as const)('sends %s as %s', (serviceClass, expectedCode) => {
    expect(resolveSatusehatServiceClassCode(serviceClass)).toBe(expectedCode);
  });

  it('sends nothing for an unmapped class', () => {
    expect(resolveSatusehatServiceClassCode(null)).toBeNull();
  });
});
