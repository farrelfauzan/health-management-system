import { DoctorMandateRecord } from '@hms/shared-types';

import { toDoctorMandateView } from './to-doctor-mandate-view';

function buildRecord(overrides: Partial<DoctorMandateRecord> = {}): DoctorMandateRecord {
  const timestamp = new Date('2026-09-01T02:00:00.000Z');
  return {
    id: '1b6a6a2e-9d6e-4e58-8a2f-0f0f2c3b4d55',
    midwifeDoctorId: '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11',
    mandatingDoctorId: 'c2a4e1d0-3f5b-4a6c-8d9e-1f0a2b3c4d56',
    mandatingDoctorName: 'dr. Uji Coba',
    kind: 'MANDATE',
    instruction: 'Pemasangan IUD pada pasien KB',
    icd9cmCodes: ['69.7'],
    validFrom: new Date('2026-09-01T00:00:00.000Z'),
    validUntil: new Date('2026-12-01T00:00:00.000Z'),
    instructionStorageKey: 'doctor-mandates/7c1f2f0a/instruction.pdf',
    instructionMimeType: 'application/pdf',
    instructionSizeBytes: 1024,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdById: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

const today = new Date('2026-09-15T00:00:00.000Z');

describe('toDoctorMandateView', () => {
  it('keeps the storage key inside the API', () => {
    const actual = toDoctorMandateView(buildRecord(), today);

    expect(actual).not.toHaveProperty('instructionStorageKey');
    expect(actual.instructionMimeType).toBe('application/pdf');
  });

  it('reports dates as clinic-local calendar days, not instants', () => {
    const actual = toDoctorMandateView(buildRecord(), today);

    expect(actual.validFrom).toBe('2026-09-01');
    expect(actual.validUntil).toBe('2026-12-01');
  });

  it('warns about nothing for a mandate of any length', () => {
    // A MANDATE leaves responsibility with the doctor, so the absence window
    // PP 28/2024 Pasal 745(3) describes does not apply to it at all.
    const actual = toDoctorMandateView(
      buildRecord({ validUntil: new Date('2026-09-02T00:00:00.000Z') }),
      today,
    );

    expect(actual.policyWarnings).toEqual([]);
  });

  it('warns when a delegation is shorter than the absence it describes', () => {
    const actual = toDoctorMandateView(
      buildRecord({ kind: 'DELEGATION', validUntil: new Date('2026-09-10T00:00:00.000Z') }),
      today,
    );

    expect(actual.policyWarnings).toEqual(['DELEGATION_OUTSIDE_ABSENCE_WINDOW']);
  });

  it('accepts a delegation of exactly one month without warning', () => {
    const actual = toDoctorMandateView(
      buildRecord({ kind: 'DELEGATION', validUntil: new Date('2026-09-30T00:00:00.000Z') }),
      today,
    );

    expect(actual.policyWarnings).toEqual([]);
  });

  it('warns when another live mandate already overlaps this window', () => {
    const actual = toDoctorMandateView(buildRecord(), today, 1);

    expect(actual.policyWarnings).toEqual(['OVERLAPS_EXISTING_MANDATE']);
  });

  it('reports a revoked mandate as revoked whatever its window says', () => {
    const actual = toDoctorMandateView(
      buildRecord({ revokedAt: new Date('2026-09-10T02:00:00.000Z'), revokeReason: 'Dicabut' }),
      today,
    );

    expect(actual.status).toBe('REVOKED');
    expect(actual.revokeReason).toBe('Dicabut');
  });
});
