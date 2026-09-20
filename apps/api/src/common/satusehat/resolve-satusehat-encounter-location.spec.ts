import { resolveSatusehatEncounterLocation } from './resolve-satusehat-encounter-location';

describe('resolveSatusehatEncounterLocation', () => {
  it('reports under the poli Location once that poli is registered', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: 'Poli KIA',
        specialtyLocationId: 'poli-kia-location-id',
        registeredRootLocationId: 'registered-site-id',
        configuredLocationId: 'env-location-id',
        bedLocationIds: [],
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
        bedLocationIds: [],
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
        bedLocationIds: [],
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
        bedLocationIds: [],
      }),
    ).toEqual({ locationId: 'registered-site-id', fallbackReason: 'NO_POLI' });
  });

  it('names the site as the beds fall back to, and flags an unregistered bed', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: 'Poli KIA',
        specialtyLocationId: 'poli-kia-location-id',
        registeredRootLocationId: 'registered-site-id',
        configuredLocationId: 'env-location-id',
        bedLocationIds: ['bed-1-location-id', null],
      }),
    ).toEqual({ locationId: 'registered-site-id', fallbackReason: 'BED_NOT_REGISTERED' });
  });

  it('flags nothing for a stay whose every bed is registered', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: null,
        specialtyLocationId: null,
        registeredRootLocationId: 'registered-site-id',
        configuredLocationId: 'env-location-id',
        bedLocationIds: ['bed-1-location-id', 'bed-4-location-id'],
      }),
    ).toEqual({ locationId: 'registered-site-id', fallbackReason: null });
  });

  it('resolves no location at all when nothing is configured', () => {
    expect(
      resolveSatusehatEncounterLocation({
        specialtyName: 'Poli KIA',
        specialtyLocationId: null,
        registeredRootLocationId: null,
        configuredLocationId: undefined,
        bedLocationIds: [],
      }),
    ).toEqual({ locationId: null, fallbackReason: 'POLI_NOT_REGISTERED' });
  });
});
