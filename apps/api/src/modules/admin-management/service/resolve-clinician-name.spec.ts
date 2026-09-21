import { resolveClinicianName } from '@hms/shared-types';

/**
 * P20-T07. An immunization performer and a lab-order requester are recorded
 * by doctor profile; the name printed for them follows D-027 — the owning
 * account's name first, the profile's only while there is no account name.
 */
describe('the clinician name resolver (P20-T07)', () => {
  it("prefers the owning account's name over the profile's", () => {
    const inputProfile = {
      fullName: 'dr. Sari',
      ownerUser: { fullName: 'dr. Sari Wulandari, Sp.A' },
    };

    expect(resolveClinicianName(inputProfile)).toBe('dr. Sari Wulandari, Sp.A');
  });

  it('falls back to the profile name when the account has none', () => {
    expect(resolveClinicianName({ fullName: 'Bd. Rina', ownerUser: { fullName: null } })).toBe(
      'Bd. Rina',
    );
  });

  it('uses the profile name for a doctor who has no account yet', () => {
    expect(resolveClinicianName({ fullName: 'dr. Andi Wijaya', ownerUser: null })).toBe(
      'dr. Andi Wijaya',
    );
    expect(resolveClinicianName({ fullName: 'dr. Andi Wijaya' })).toBe('dr. Andi Wijaya');
  });

  it('treats a blank account name as absent', () => {
    expect(resolveClinicianName({ fullName: 'dr. Andi', ownerUser: { fullName: '  ' } })).toBe(
      'dr. Andi',
    );
  });

  it('is null when neither record holds a name', () => {
    expect(resolveClinicianName({ fullName: ' ', ownerUser: { fullName: null } })).toBeNull();
  });
});
