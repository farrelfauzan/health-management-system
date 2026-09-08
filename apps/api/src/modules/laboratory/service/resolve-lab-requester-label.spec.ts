import { LabOrderRecord } from '@hms/shared-types';

import { resolveLabRequesterLabel } from './resolve-lab-requester-label';

function buildOrder(overrides: Partial<LabOrderRecord> = {}): LabOrderRecord {
  return {
    orderedByName: null,
    externalRequesterName: null,
    externalRequesterFacility: null,
    ...overrides,
  } as LabOrderRecord;
}

describe('resolveLabRequesterLabel', () => {
  it('names the ordering doctor for a request raised in a consultation', () => {
    const actualLabel = resolveLabRequesterLabel(
      buildOrder({ orderedByName: 'dr. Andi Wijaya' }),
    );

    expect(actualLabel).toBe('dr. Andi Wijaya');
  });

  it('names the outside doctor and their practice for a referral', () => {
    const actualLabel = resolveLabRequesterLabel(
      buildOrder({
        externalRequesterName: 'dr. Rina Kartika',
        externalRequesterFacility: 'Klinik Sehat Bersama',
      }),
    );

    expect(actualLabel).toBe('dr. Rina Kartika (Klinik Sehat Bersama)');
  });

  it('names the outside doctor alone when no practice was given', () => {
    const actualLabel = resolveLabRequesterLabel(
      buildOrder({ externalRequesterName: 'dr. Rina Kartika' }),
    );

    expect(actualLabel).toBe('dr. Rina Kartika');
  });

  it('names nobody for a walk-in, rather than the clinic itself', () => {
    const actualLabel = resolveLabRequesterLabel(buildOrder());

    // A dash is the honest answer: the patient chose the test, and putting the
    // clinic's own name on it would read as a clinical recommendation.
    expect(actualLabel).toBe('-');
  });

  it('prefers the clinic doctor when a row somehow carries both', () => {
    const actualLabel = resolveLabRequesterLabel(
      buildOrder({
        orderedByName: 'dr. Andi Wijaya',
        externalRequesterName: 'dr. Rina Kartika',
      }),
    );

    expect(actualLabel).toBe('dr. Andi Wijaya');
  });
});
