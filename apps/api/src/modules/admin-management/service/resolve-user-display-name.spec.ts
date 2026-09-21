import { resolveUserDisplayName, resolveUserFullName } from '@hms/shared-types';

/**
 * P20-T06. The one rule every display site now asks, in D-027's order: the
 * account's own name, the pre-account doctor profile's, then the address.
 */
describe('the display name resolver (P20-T06)', () => {
  const email = 'lab1@klinik.id';

  it("prefers the account's own name — the one its owner can correct", () => {
    expect(
      resolveUserDisplayName({
        fullName: 'Dewi Lestari, A.Md.AK',
        doctorProfile: { fullName: 'an older spelling' },
        email,
      }),
    ).toBe('Dewi Lestari, A.Md.AK');
  });

  it('falls back to the name an administrator typed onto a doctor profile', () => {
    expect(
      resolveUserDisplayName({ fullName: null, doctorProfile: { fullName: 'dr. Olivia' }, email }),
    ).toBe('dr. Olivia');
  });

  it('prints the address for an account nobody has named, rather than nothing', () => {
    // The ticket's acceptance criterion: every surface still shows something,
    // and none renders blank.
    expect(resolveUserDisplayName({ fullName: null, doctorProfile: null, email })).toBe(email);
  });

  it('treats a name of only whitespace as absent, so no signature line prints blank', () => {
    expect(
      resolveUserDisplayName({ fullName: '   ', doctorProfile: { fullName: '' }, email }),
    ).toBe(email);
  });

  it('trims what it prints', () => {
    expect(resolveUserDisplayName({ fullName: '  Rani Putri  ', email })).toBe('Rani Putri');
  });

  describe('resolveUserFullName', () => {
    it('stops short of the address, so "no name" stays distinguishable', () => {
      // The roster shows the address as a second line only when a name is
      // standing in front of it; that needs to know whether one exists.
      expect(resolveUserFullName({ fullName: null, doctorProfile: null })).toBeNull();
    });

    it('agrees with the display resolver whenever a name exists', () => {
      const user = { fullName: null, doctorProfile: { fullName: 'dr. Olivia' }, email };

      expect(resolveUserFullName(user)).toBe(resolveUserDisplayName(user));
    });
  });
});
