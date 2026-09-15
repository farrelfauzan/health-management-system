import { SatusehatSubmissionImmunization } from '@hms/shared-types';

import { resolveSatusehatImmunizationEntry } from './resolve-satusehat-immunization-entry';

const doctorId = '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11';

function buildImmunization(
  overrides: Partial<SatusehatSubmissionImmunization> = {},
): SatusehatSubmissionImmunization {
  return {
    immunizationId: 'imm-1',
    kfaCode: '93023055',
    vaccineName: 'Vaksin DPT-HB-Hib',
    occurredAt: new Date('2026-07-28T02:10:00.000Z'),
    recordedAt: new Date('2026-07-28T02:11:00.000Z'),
    lotNumber: 'LOT-DPT-2026-04',
    expirationDate: '2027-04-30',
    doseNumber: 3,
    route: 'IM',
    site: 'LEFT_THIGH',
    notes: null,
    isHistorical: false,
    reason: 'IM_DASAR',
    performerId: doctorId,
    performerName: 'dr. Sari Wulandari',
    performerIhsNumber: 'N10000001',
    ...overrides,
  };
}

function resolve(immunization: SatusehatSubmissionImmunization) {
  return resolveSatusehatImmunizationEntry({
    immunization,
    encounterDoctorId: doctorId,
    encounterDoctorName: 'dr. Sari Wulandari',
    encounterPractitionerIhsNumber: 'N10000001',
  });
}

describe('resolveSatusehatImmunizationEntry', () => {
  it('sends a complete dose under the attending doctor', () => {
    const actual = resolve(buildImmunization());

    expect(actual.skipReason).toBeNull();
    expect(actual.immunization?.performer).toEqual({
      ihsNumber: 'N10000001',
      name: 'dr. Sari Wulandari',
    });
  });

  it.each([
    ['NO_KFA_CODE', { kfaCode: null }],
    ['IMMUNIZATION_DOSE_NUMBER_MISSING', { doseNumber: null }],
    ['IMMUNIZATION_REASON_MISSING', { reason: null }],
  ] as const)('skips with %s', (expectedReason, overrides) => {
    const actual = resolve(buildImmunization(overrides));

    expect(actual).toEqual({ skipReason: expectedReason, immunization: null });
  });

  it('names the clinician on the row when it is not the attending doctor', () => {
    const actual = resolve(
      buildImmunization({
        performerId: 'midwife-1',
        performerName: 'Bd. Rina Kusuma',
        performerIhsNumber: 'N20000002',
      }),
    );

    expect(actual.immunization?.performer).toEqual({
      ihsNumber: 'N20000002',
      name: 'Bd. Rina Kusuma',
    });
  });

  it('falls back to the attending doctor when nobody is named on the row', () => {
    const actual = resolve(
      buildImmunization({ performerId: null, performerName: null, performerIhsNumber: null }),
    );

    expect(actual.immunization?.performer.ihsNumber).toBe('N10000001');
  });

  it("uses the encounter's freshly resolved number for the doctor's own row", () => {
    // Auto-linking during this submission updates the profile after the
    // bundle data was read, so the row's own copy can still be null.
    const actual = resolve(buildImmunization({ performerId: doctorId, performerIhsNumber: null }));

    expect(actual.immunization?.performer.ihsNumber).toBe('N10000001');
  });

  it('skips a dose whose named performer has no practitioner id', () => {
    const actual = resolve(
      buildImmunization({ performerId: 'midwife-2', performerName: 'Bd. Sari', performerIhsNumber: null }),
    );

    expect(actual).toEqual({ skipReason: 'IMMUNIZATION_PERFORMER_UNLINKED', immunization: null });
  });
});
