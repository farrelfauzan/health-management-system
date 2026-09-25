import { createServiceTariffSchema } from '@hms/shared-types';

import { DEMO_TARIFF_FIXTURES } from './demo-tariff-fixtures';

describe('DEMO_TARIFF_FIXTURES', () => {
  it('passes the same validation the tariff screen applies', () => {
    DEMO_TARIFF_FIXTURES.forEach((fixture) =>
      expect(createServiceTariffSchema.safeParse(fixture).success).toBe(true),
    );
  });

  /** `service_tariffs.code` and `icd9cm_code` are both unique. */
  it('never repeats a tariff code or an ICD-9-CM code', () => {
    const inputCodes = DEMO_TARIFF_FIXTURES.map((fixture) => fixture.code);
    const inputProcedureCodes = DEMO_TARIFF_FIXTURES.flatMap((fixture) =>
      fixture.icd9cmCode === undefined ? [] : [fixture.icd9cmCode],
    );
    expect(new Set(inputCodes).size).toBe(inputCodes.length);
    expect(new Set(inputProcedureCodes).size).toBe(inputProcedureCodes.length);
  });

  it('prices ANC, every KB method the demo shows, persalinan and a manual administrasi line', () => {
    const actualCodes = DEMO_TARIFF_FIXTURES.map((fixture) => fixture.code);
    expect(actualCodes).toEqual(
      expect.arrayContaining([
        'KIA-ANC',
        'KB-SUNTIK',
        'KB-PIL',
        'KB-IMPLAN',
        'KB-IUD',
        'PERSALINAN-NORMAL',
        'ADMINISTRASI',
      ]),
    );
  });
});
