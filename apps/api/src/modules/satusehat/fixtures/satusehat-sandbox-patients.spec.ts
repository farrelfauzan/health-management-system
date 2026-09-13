import { SATUSEHAT_SANDBOX_PATIENTS } from './satusehat-sandbox-patients';

/**
 * Pins the probe results the fixture was built from (P21-T10), so a later edit
 * that copies a NIK back out of the published table has to remove a test to do
 * it.
 */
describe('SATUSEHAT_SANDBOX_PATIENTS', () => {
  const PROBED_SINGLE_MATCH_NIKS = [
    '9271060312000002',
    '9271060312000003',
    '0000000000000000',
    '1111111111111111',
    '9999999999999999',
  ];

  it('holds exactly the NIKs that resolved to one record when probed live', () => {
    expect(SATUSEHAT_SANDBOX_PATIENTS.map((patient) => patient.nik)).toEqual(
      PROBED_SINGLE_MATCH_NIKS,
    );
  });

  it('excludes the ambiguous and nonexistent NIKs from the published table', () => {
    const niks = SATUSEHAT_SANDBOX_PATIENTS.map((patient) => patient.nik);

    expect(niks).not.toContain('9271060312000001');
    expect(niks).not.toContain('3524016901830001');
    expect(niks).not.toContain('3175031305200001');
  });

  it('carries sixteen-digit NIKs with no duplicates', () => {
    const niks = SATUSEHAT_SANDBOX_PATIENTS.map((patient) => patient.nik);

    niks.forEach((nik) => expect(nik).toMatch(/^\d{16}$/));
    expect(new Set(niks).size).toBe(niks.length);
  });

  it('records no IHS number, which is only ever resolved from the NIK', () => {
    SATUSEHAT_SANDBOX_PATIENTS.forEach((patient) => {
      expect(Object.keys(patient).sort()).toEqual(['name', 'nik', 'sex']);
    });
  });
});
