import { describe, expect, it } from 'vitest';

import {
  buildEducationPayload,
  buildLicensePayload,
  toLicenseRows,
  type EducationRow,
  type LicenseRow,
} from './doctor-credential-rows';

function buildLicenseRow(overrides: Partial<LicenseRow> = {}): LicenseRow {
  return {
    key: 'row-1',
    type: 'SIP',
    licenseNumber: 'SIP-001',
    issuedAt: '2026-01-01',
    expiresAt: '2027-01-01',
    ...overrides,
  };
}

function buildEducationRow(overrides: Partial<EducationRow> = {}): EducationRow {
  return {
    key: 'row-1',
    institution: 'Universitas Indonesia',
    degree: 'dr.',
    fieldOfStudy: 'Pendidikan Dokter',
    graduationYear: '2015',
    ...overrides,
  };
}

describe('buildLicensePayload', () => {
  it('sends the complete set, since the API replaces the whole list', () => {
    const payload = buildLicensePayload([
      buildLicenseRow(),
      buildLicenseRow({ key: 'row-2', type: 'STR', licenseNumber: 'STR-002', expiresAt: '' }),
    ]);

    expect(payload).toEqual([
      { type: 'SIP', licenseNumber: 'SIP-001', issuedAt: '2026-01-01', expiresAt: '2027-01-01' },
      { type: 'STR', licenseNumber: 'STR-002', issuedAt: '2026-01-01' },
    ]);
  });

  it('drops an untouched blank row rather than sending an empty licence', () => {
    const payload = buildLicensePayload([buildLicenseRow({ licenseNumber: '   ' })]);

    expect(payload).toEqual([]);
  });

  it('omits an absent expiry instead of sending an empty string', () => {
    const [license] = buildLicensePayload([buildLicenseRow({ expiresAt: '', issuedAt: '' })]);

    expect(license).not.toHaveProperty('expiresAt');
    expect(license).not.toHaveProperty('issuedAt');
  });
});

describe('buildEducationPayload', () => {
  it('coerces the graduation year to a number', () => {
    const [education] = buildEducationPayload([buildEducationRow()]);

    expect(education?.graduationYear).toBe(2015);
  });

  it('omits a blank graduation year rather than sending zero', () => {
    const [education] = buildEducationPayload([buildEducationRow({ graduationYear: '' })]);

    expect(education).not.toHaveProperty('graduationYear');
  });

  it('drops a row missing the institution or degree', () => {
    expect(buildEducationPayload([buildEducationRow({ institution: '' })])).toEqual([]);
    expect(buildEducationPayload([buildEducationRow({ degree: '  ' })])).toEqual([]);
  });
});

describe('toLicenseRows', () => {
  it('maps absent dates to empty strings the inputs can render', () => {
    const [row] = toLicenseRows([
      {
        id: 'license-1',
        type: 'STR',
        licenseNumber: 'STR-001',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(row).toMatchObject({ key: 'license-1', issuedAt: '', expiresAt: '' });
  });
});
