import { updateClinicProfileSchema } from '@hms/shared-types';

/**
 * The clinic's coordinates for SATUSEHAT Locations (P24-T05, FR-LOC-01).
 *
 * The official Location example swaps latitude and longitude, so the bounds are
 * Indonesia's box and each message says what the value looks like instead.
 */
describe('updateClinicProfileSchema coordinates', () => {
  const JAKARTA = { latitude: -6.1754, longitude: 106.8272 };

  function findMessages(input: unknown): string[] {
    const result = updateClinicProfileSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  }

  it('accepts a position inside Indonesia', () => {
    expect(updateClinicProfileSchema.safeParse(JAKARTA).success).toBe(true);
  });

  it('refuses latitude and longitude swapped, saying which is which', () => {
    const actual = findMessages({ latitude: 106.8272, longitude: -6.1754 });

    expect(actual).toEqual(
      expect.arrayContaining([
        'Latitude in Indonesia is between -11 and 6; this looks like a longitude',
        'Longitude in Indonesia is between 95 and 141; this looks like a latitude',
      ]),
    );
  });

  it.each([
    ['a latitude north of Sabang', { latitude: 7, longitude: 106.8 }],
    ['a latitude south of Rote', { latitude: -12, longitude: 106.8 }],
    ['a longitude west of Sumatra', { latitude: -6.2, longitude: 94 }],
    ['a longitude east of Papua', { latitude: -6.2, longitude: 142 }],
  ])('refuses %s', (_label, input) => {
    expect(updateClinicProfileSchema.safeParse(input).success).toBe(false);
  });

  it('refuses half a position', () => {
    expect(findMessages({ latitude: -6.1754 })).toContain(
      'Latitude and longitude are saved together',
    );
  });

  it('clears both together', () => {
    expect(updateClinicProfileSchema.safeParse({ latitude: null, longitude: null }).success).toBe(
      true,
    );
  });

  it('refuses clearing only one', () => {
    expect(findMessages({ latitude: null, longitude: 106.8272 })).toContain(
      'Latitude and longitude are saved together',
    );
  });

  it('still accepts an update that leaves the coordinates alone', () => {
    expect(updateClinicProfileSchema.safeParse({ name: 'Klinik Bidan Sehat' }).success).toBe(true);
  });
});
