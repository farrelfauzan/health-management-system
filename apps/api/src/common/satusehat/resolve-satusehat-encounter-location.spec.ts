import { resolveSatusehatEncounterLocation } from './resolve-satusehat-encounter-location';

describe('resolveSatusehatEncounterLocation', () => {
  it('reports under the poli Location once that poli is registered', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: 'Poli KIA',
        specialtyLocationId: 'poli-kia-location-id',
        registeredRootLocationId: 'registered-site-id',
        configuredLocationId: 'env-location-id',
      }),
    ).toEqual({ locationId: 'poli-kia-location-id', fallbackReason: null });
  });

  it('falls back to the registered root and flags an unregistered poli', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: 'Poli Umum',
        specialtyLocationId: null,
        registeredRootLocationId: 'registered-site-id',
        configuredLocationId: 'env-location-id',
      }),
    ).toEqual({ locationId: 'registered-site-id', fallbackReason: 'POLI_NOT_REGISTERED' });
  });

  it('falls back to the configured location when no root is registered either', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: 'Poli Umum',
        specialtyLocationId: null,
        registeredRootLocationId: null,
        configuredLocationId: 'env-location-id',
      }),
    ).toEqual({ locationId: 'env-location-id', fallbackReason: 'POLI_NOT_REGISTERED' });
  });

  it('separates a walk-in that names no poli from a poli nobody registered', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: null,
        specialtyLocationId: null,
        registeredRootLocationId: 'registered-site-id',
        configuredLocationId: 'env-location-id',
      }),
    ).toEqual({ locationId: 'registered-site-id', fallbackReason: 'NO_POLI' });
  });

  it('resolves no location at all when nothing is configured', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: 'Poli KIA',
        specialtyLocationId: null,
        registeredRootLocationId: null,
        configuredLocationId: undefined,
      }),
    ).toEqual({ locationId: null, fallbackReason: 'POLI_NOT_REGISTERED' });
  });
});
