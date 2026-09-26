import { describe, expect, it } from 'vitest';

import { resolveShellProfile } from './shell-profile';

describe('resolveShellProfile', () => {
  it('greets a named pharmacist by the name claim, verbatim (P20-T08)', () => {
    const actualProfile = resolveShellProfile({
      sub: 'user-id',
      email: 'apotek1@klinik.id',
      name: 'Rina Apoteker',
      roles: ['PHARMACIST'],
    });

    expect(actualProfile).toEqual({
      displayName: 'Rina Apoteker',
      isFallbackName: false,
      roleLabel: 'Pharmacist',
      roleKey: 'pharmacist',
      email: 'apotek1@klinik.id',
    });
  });

  it('shows the email address verbatim when nothing names the account, never a title-cased guess', () => {
    const actualProfile = resolveShellProfile({
      email: 'apotek1@klinik.id',
      roles: ['PHARMACIST'],
    });

    expect(actualProfile.displayName).toBe('apotek1@klinik.id');
    expect(actualProfile.isFallbackName).toBe(true);
  });

  it('degrades a session issued before the name claim existed to its email address', () => {
    // An access token minted by an older API carries no `name`, and neither
    // does a hint written before the field existed; both resolve to the
    // address until the next refresh writes the claim.
    const actualProfile = resolveShellProfile({
      sub: 'user-id',
      email: 'sarah.chen@salingjaga.com',
      roles: ['ADMIN'],
      exp: 1_900_000_000,
    });

    expect(actualProfile).toEqual({
      displayName: 'sarah.chen@salingjaga.com',
      isFallbackName: true,
      roleLabel: 'Admin',
      roleKey: 'admin',
      email: 'sarah.chen@salingjaga.com',
    });
  });

  it('treats a blank name claim as no name', () => {
    const actualProfile = resolveShellProfile({
      email: 'front.desk@clinic.local',
      name: '   ',
      roles: ['ADMIN'],
    });

    expect(actualProfile.displayName).toBe('front.desk@clinic.local');
    expect(actualProfile.isFallbackName).toBe(true);
  });

  it('falls back to defaults when claims are missing', () => {
    expect(resolveShellProfile(null)).toEqual({
      displayName: 'MetaKlinik User',
      isFallbackName: true,
      roleLabel: 'Staff',
      roleKey: 'staff',
      email: '',
    });
  });

  it('uses the placeholder only when there is neither a name nor an address', () => {
    const actualProfile = resolveShellProfile({ roles: ['ADMIN'] });

    expect(actualProfile.displayName).toBe('MetaKlinik User');
    expect(actualProfile.isFallbackName).toBe(true);
  });

  it("uses the person's name as written, without re-casing it", () => {
    const actualProfile = resolveShellProfile({
      email: 'bidan.sari@clinic.local',
      name: 'Siti Nurhaliza binti Abdullah',
      roles: ['MIDWIFE'],
      clinicianProfession: 'MIDWIFE',
    });

    expect(actualProfile).toEqual({
      displayName: 'Siti Nurhaliza binti Abdullah',
      isFallbackName: false,
      roleLabel: 'Midwife',
      roleKey: 'midwife',
      email: 'bidan.sari@clinic.local',
    });
  });

  it('labels a clinician by the profession on their profile, not by their role code', () => {
    // An administrator correcting a profession does not re-grant roles, so a
    // doctor whose account still holds MIDWIFE must still read as a doctor.
    const actualProfile = resolveShellProfile({
      email: 'olivia@clinic.local',
      name: 'Olivia Kirana',
      roles: ['MIDWIFE'],
      clinicianProfession: 'DOCTOR',
    });

    expect(actualProfile.roleKey).toBe('doctor');
    expect(actualProfile.roleLabel).toBe('Doctor');
  });

  it('labels a midwife session as a midwife (P24-T03)', () => {
    const actualProfile = resolveShellProfile({
      email: 'bidan.sari@clinic.local',
      roles: ['MIDWIFE'],
    });

    expect(actualProfile.roleKey).toBe('midwife');
  });
});
