import { findLocationRegistrationBlocker } from './find-location-registration-blocker';

describe('findLocationRegistrationBlocker', () => {
  const JAKARTA = { clinicLatitude: -6.1754, clinicLongitude: 106.8272 };

  it('lets a poli or ward register once the clinic has coordinates', () => {
    expect(findLocationRegistrationBlocker({ ...JAKARTA, roomClass: null })).toBeNull();
  });

  it.each([
    ['no latitude', { clinicLatitude: null, clinicLongitude: 106.8272 }],
    ['no longitude', { clinicLatitude: -6.1754, clinicLongitude: null }],
  ])('blocks every location while the clinic has %s', (_label, coordinates) => {
    expect(findLocationRegistrationBlocker({ ...coordinates, roomClass: null })).toEqual({
      reason: 'MISSING_COORDINATES',
      message: "Set the clinic's latitude and longitude before registering locations",
    });
  });

  it('blocks a room whose class has no service class, naming the class', () => {
    const actual = findLocationRegistrationBlocker({
      ...JAKARTA,
      roomClass: { name: 'Kelas Utama', satusehatServiceClass: null },
    });

    expect(actual).toEqual({
      reason: 'UNMAPPED_SERVICE_CLASS',
      message: 'Room class "Kelas Utama" has no SATUSEHAT service class',
    });
  });

  it('lets a room of a mapped class register', () => {
    expect(
      findLocationRegistrationBlocker({
        ...JAKARTA,
        roomClass: { name: 'Kelas 2', satusehatServiceClass: 'CLASS_2' },
      }),
    ).toBeNull();
  });

  it('reports missing coordinates before an unmapped class, which is the fix an admin makes first', () => {
    const actual = findLocationRegistrationBlocker({
      clinicLatitude: null,
      clinicLongitude: null,
      roomClass: { name: 'Kelas Utama', satusehatServiceClass: null },
    });

    expect(actual?.reason).toBe('MISSING_COORDINATES');
  });
});
