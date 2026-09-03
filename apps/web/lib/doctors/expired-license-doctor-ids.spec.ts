import type { DoctorLicenseExpiryBucketsView, DoctorLicenseExpiryRow } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { buildExpiredLicenseIndex } from './expired-license-doctor-ids';

function buildRow(overrides: Partial<DoctorLicenseExpiryRow>): DoctorLicenseExpiryRow {
  return {
    licenseId: 'license-1',
    doctorId: 'doctor-1',
    doctorName: 'dr. Rina Wijaya',
    type: 'SIP',
    licenseNumber: 'SIP-EXAMPLE-0001',
    issuedAt: '2021-03-12',
    expiresAt: '2026-08-20',
    daysUntilExpiry: -14,
    ...overrides,
  };
}

function buildBuckets(expired: DoctorLicenseExpiryRow[]): DoctorLicenseExpiryBucketsView {
  return { expired, within30Days: [], within60Days: [], within90Days: [] };
}

describe('buildExpiredLicenseIndex', () => {
  it('keeps the soonest-expiring lapsed licence when a doctor has more than one', () => {
    const actualIndex = buildExpiredLicenseIndex(
      buildBuckets([
        buildRow({ licenseId: 'sip', expiresAt: '2026-08-20' }),
        buildRow({ licenseId: 'str', type: 'STR', expiresAt: '2026-07-01' }),
      ]),
    );

    expect(actualIndex.get('doctor-1')).toBe('2026-07-01');
  });

  it('indexes each doctor separately', () => {
    const actualIndex = buildExpiredLicenseIndex(
      buildBuckets([
        buildRow({ doctorId: 'doctor-1', expiresAt: '2026-08-20' }),
        buildRow({ doctorId: 'doctor-2', licenseId: 'other', expiresAt: '2026-06-05' }),
      ]),
    );

    expect(actualIndex.get('doctor-1')).toBe('2026-08-20');
    expect(actualIndex.get('doctor-2')).toBe('2026-06-05');
  });

  it('ignores the not-yet-expired buckets, so a licence lapsing next week raises no flag', () => {
    const actualIndex = buildExpiredLicenseIndex({
      expired: [],
      within30Days: [buildRow({ expiresAt: '2026-09-10', daysUntilExpiry: 7 })],
      within60Days: [],
      within90Days: [],
    });

    expect(actualIndex.size).toBe(0);
  });
});
