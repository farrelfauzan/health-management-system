import { describe, expect, it } from 'vitest';

import { buildImmunizationPayload } from './build-immunization-payload';
import type { ImmunizationDraft } from './immunization-draft';

function buildDraft(overrides: Partial<ImmunizationDraft> = {}): ImmunizationDraft {
  return {
    medicationId: 'med-1',
    reason: 'IM_DASAR',
    isHistorical: false,
    lotNumber: 'LOT-1',
    expirationDate: '2027-04-30',
    doseNumber: '1',
    route: 'UNSPECIFIED',
    site: 'UNSPECIFIED',
    ...overrides,
  };
}

describe('buildImmunizationPayload', () => {
  it('sends a dose given here with its lot, expiry, dose and reason', () => {
    const actual = buildImmunizationPayload(buildDraft({ route: 'IM' }));

    expect(actual).toEqual({
      errorKey: null,
      payload: {
        medicationId: 'med-1',
        reason: 'IM_DASAR',
        isHistorical: false,
        doseNumber: 1,
        lotNumber: 'LOT-1',
        expirationDate: '2027-04-30',
        route: 'IM',
      },
    });
  });

  it.each([[{ lotNumber: '  ' }], [{ expirationDate: '' }]])(
    'refuses a dose given here without its batch facts: %o',
    (overrides) => {
      const actual = buildImmunizationPayload(buildDraft(overrides));

      expect(actual.errorKey).toBe('encounters.immunization.newDoseRequired');
    },
  );

  it('saves a historical dose without lot or expiry, and drops any that were typed', () => {
    const actual = buildImmunizationPayload(
      buildDraft({ isHistorical: true, expirationDate: '', lotNumber: 'LOT-TYPED' }),
    );

    expect(actual.payload).toEqual({
      medicationId: 'med-1',
      reason: 'IM_DASAR',
      isHistorical: true,
      doseNumber: 1,
    });
  });

  it.each([
    [{ medicationId: '' }, 'encounters.immunization.pick'],
    [{ reason: '' }, 'encounters.immunization.pickReason'],
    [{ doseNumber: '', isHistorical: true }, 'encounters.immunization.doseRequired'],
  ])('names what is missing: %o', (overrides, expectedKey) => {
    const actual = buildImmunizationPayload(buildDraft(overrides));

    expect(actual).toEqual({ payload: null, errorKey: expectedKey });
  });
});
