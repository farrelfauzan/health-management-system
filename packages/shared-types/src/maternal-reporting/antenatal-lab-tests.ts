import type { AntenatalLabTestMatcher } from '#maternal-reporting/types';

/**
 * Which laboratory catalog rows count as each LB3-KIA antenatal test
 * (P25-T15, D-040). Matched by LOINC first, then by the clinic's local code
 * from `prisma/lab-catalog.sql`, because LOINC is nullable on a local test.
 *
 * **Provisional.** The list covers the seeded catalog and the common rapid
 * tests; a clinic that codes a test differently adds it here, not in the
 * counting rule.
 */
export const ANTENATAL_LAB_TEST_MATCHERS: readonly AntenatalLabTestMatcher[] = [
  { test: 'HB', loincCodes: ['718-7', '20509-6', '30313-1'], localCodes: ['HB'] },
  {
    test: 'PROTEIN_URINE',
    loincCodes: ['5804-0', '2888-6', '20454-5'],
    localCodes: ['URPROT'],
  },
  {
    test: 'GLUCOSE',
    loincCodes: ['2345-7', '1558-6', '1521-4', '5792-7', '2339-0'],
    localCodes: ['GDS', 'GDP', 'GD2PP', 'URGLU'],
  },
  { test: 'HBSAG', loincCodes: ['5195-3', '5196-1', '75410-1'], localCodes: ['HBSAG'] },
  {
    test: 'SYPHILIS',
    loincCodes: ['20508-8', '14904-7', '24110-9', '22462-6', '31147-2'],
    localCodes: ['RPR', 'VDRL', 'TPHA', 'SIFILIS'],
  },
  {
    test: 'HIV',
    loincCodes: ['75622-1', '7917-8', '31201-7', '68961-2', '56888-1'],
    localCodes: ['ANTIHIV', 'HIV'],
  },
];
