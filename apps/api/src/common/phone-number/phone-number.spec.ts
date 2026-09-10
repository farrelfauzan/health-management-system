import {
  createPatientSchema,
  formatPhoneNumber,
  indonesianPhoneNumberSchema,
  normalizePhoneNumber,
} from '@hms/shared-types';

/**
 * `SJ-166`. The phone rule lives in `@hms/shared-types` so the browser, the
 * API and the SQL backfill all canonicalise a number the same way — and
 * `packages/shared-types` has no test runner of its own, so its unit tests sit
 * here, next to the app that has one, exactly as `common/features` does for
 * the feature catalog.
 */
describe('normalizePhoneNumber', () => {
  it.each([
    ['a national number', '081210000001'],
    ['an international number', '+62 812-1000-0001'],
    ['a country code without a plus', '62812 1000 0001'],
    ['a number in brackets', '(0812) 1000-0001'],
  ])('reduces %s to the same canonical digits', (_label, inputPhoneNumber) => {
    // A missed match is not a harmless false negative here: it silently
    // creates a second record for a patient the clinic already knows.
    expect(normalizePhoneNumber(inputPhoneNumber)).toBe('6281210000001');
  });

  it('leaves a foreign number alone rather than assuming Indonesia', () => {
    expect(normalizePhoneNumber('+65 8123 4567')).toBe('6581234567');
  });

  it('returns digits for a value it cannot interpret, so it fails to match rather than mismatching', () => {
    expect(normalizePhoneNumber('tidak punya')).toBe('');
  });
});

describe('indonesianPhoneNumberSchema', () => {
  it.each([
    ['a national number', '081210000001'],
    ['an international number', '+62 812-1000-0001'],
    ['a country code without a plus', '62812 1000 0001'],
    ['a number in brackets', '(0812) 1000-0001'],
    ['a number with surrounding whitespace', '  0812 1000 0001  '],
  ])('stores %s as the same canonical value', (_label, inputPhoneNumber) => {
    const actual = indonesianPhoneNumberSchema.parse(inputPhoneNumber);
    expect(actual).toBe('6281210000001');
  });

  it('accepts a landline, which is shorter than a mobile number', () => {
    expect(indonesianPhoneNumberSchema.parse('021-12345678')).toBe('622112345678');
  });

  it.each([
    ['letters', 'tidak punya ya'],
    ['a double country-code prefix', '+62081210000001'],
    ['too few digits', '628123'],
    ['too many digits', '62812100000012345'],
    ['a string longer than any phone number', '0'.repeat(40)],
  ])('rejects %s', (_label, inputPhoneNumber) => {
    expect(indonesianPhoneNumberSchema.safeParse(inputPhoneNumber).success).toBe(false);
  });

  it('normalises the patient create payload rather than storing what was typed', () => {
    const actual = createPatientSchema.parse({
      fullName: 'Siti Rahayu',
      dateOfBirth: '1990-04-11',
      sex: 'FEMALE',
      phoneNumber: '0812-1000-0001',
      address: 'Jalan Melati 4',
      // `P19-T11` made the region chain part of the front-desk create, so the
      // payload has to carry one before the phone rule is reached at all.
      provinceCode: '31',
      regencyCode: '31.71',
      districtCode: '31.71.01',
      villageCode: '31.71.01.1001',
      emergencyContactPhone: '+62 813 2000 0002',
      privacyNotice: {
        privacyNoticeVersionId: '2f2f0a3a-2f4c-4d0a-9a3f-1f9a2c3d4e5f',
        locale: 'id',
        outcome: 'ACKNOWLEDGED',
        subjectType: 'SELF',
        provenance: 'FRONT_DESK',
      },
    });
    expect(actual.phoneNumber).toBe('6281210000001');
    expect(actual.emergencyContactPhone).toBe('6281320000002');
  });
});

describe('formatPhoneNumber', () => {
  it('groups an eleven-digit national part the way a receptionist reads it', () => {
    expect(formatPhoneNumber('6281234567890')).toBe('+62 812-3456-7890');
  });

  it('formats a legacy row that was never normalised', () => {
    expect(formatPhoneNumber('0812-3456-7890')).toBe('+62 812-3456-7890');
  });

  it('falls back to groups of four when the national part is not a mobile number', () => {
    expect(formatPhoneNumber('622112345678')).toBe('+62 2112-3456-78');
  });

  it('returns a value it cannot interpret untouched rather than inventing a shape', () => {
    expect(formatPhoneNumber('  tidak punya  ')).toBe('tidak punya');
    expect(formatPhoneNumber('')).toBe('');
  });
});
