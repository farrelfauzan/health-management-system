import { assertDemoSeedTarget } from './assert-demo-seed-target';

describe('assertDemoSeedTarget', () => {
  const SEEDED_ROLE_CODES = [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'MIDWIFE',
    'LAB_TECHNICIAN',
    'PHARMACIST',
    'PATIENT',
  ];

  it('allows a non-production database that holds the base seed', () => {
    expect(() =>
      assertDemoSeedTarget({
        nodeEnv: 'development',
        database: { presentRoleCodes: SEEDED_ROLE_CODES, hasPrivacyNotice: true },
      }),
    ).not.toThrow();
  });

  it('allows an unset NODE_ENV before the database has been read', () => {
    expect(() => assertDemoSeedTarget({ nodeEnv: undefined })).not.toThrow();
  });

  it('refuses NODE_ENV=production before anything boots', () => {
    expect(() => assertDemoSeedTarget({ nodeEnv: 'production' })).toThrow(/NODE_ENV is production/);
  });

  /**
   * Checked first, so a production database that happens to hold the base
   * seed is refused on the environment rather than let through on its data.
   */
  it('refuses NODE_ENV=production even when the base seed is complete', () => {
    expect(() =>
      assertDemoSeedTarget({
        nodeEnv: 'production',
        database: { presentRoleCodes: SEEDED_ROLE_CODES, hasPrivacyNotice: true },
      }),
    ).toThrow(/NODE_ENV is production/);
  });

  it('refuses a database without the base seed and names the missing roles', () => {
    expect(() =>
      assertDemoSeedTarget({
        nodeEnv: 'development',
        database: { presentRoleCodes: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'], hasPrivacyNotice: true },
      }),
    ).toThrow(/MIDWIFE, LAB_TECHNICIAN, PHARMACIST are missing/);
  });

  it('refuses a database with no privacy notice to record patient evidence against', () => {
    expect(() =>
      assertDemoSeedTarget({
        nodeEnv: 'development',
        database: { presentRoleCodes: SEEDED_ROLE_CODES, hasPrivacyNotice: false },
      }),
    ).toThrow(/no current privacy notice/);
  });
});
