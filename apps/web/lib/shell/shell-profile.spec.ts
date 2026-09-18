import { describe, expect, it } from 'vitest';

import { resolveShellProfile } from './shell-profile';

describe('resolveShellProfile', () => {
  it('derives the display name from the email local part and formats the primary role', () => {
    const actualProfile = resolveShellProfile({
      sub: 'user-id',
      email: 'admin@salingjaga.com',
      roles: ['SUPER_ADMIN'],
    });

    expect(actualProfile).toEqual({
      displayName: 'Admin',
      isFallbackName: false,
      roleLabel: 'Super Admin',
      roleKey: 'superAdmin',
      email: 'admin@salingjaga.com',
    });
  });

  it('formats dotted email local parts as separate words', () => {
    const actualProfile = resolveShellProfile({
      email: 'sarah.chen@salingjaga.com',
      roles: ['ADMIN'],
    });

    expect(actualProfile).toEqual({
      displayName: 'Sarah Chen',
      isFallbackName: false,
      roleLabel: 'Admin',
      roleKey: 'admin',
      email: 'sarah.chen@salingjaga.com',
    });
  });

  it('falls back to defaults when claims are missing', () => {
    expect(resolveShellProfile(null)).toEqual({
      displayName: 'Saling Jaga User',
      isFallbackName: true,
      roleLabel: 'Staff',
      roleKey: 'staff',
      email: '',
    });
  });

  it("prefers the name on the person's own record over their email address", () => {
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

  it('keeps the email fallback for an account no record names', () => {
    const actualProfile = resolveShellProfile({
      email: 'front.desk@clinic.local',
      roles: ['ADMIN'],
    });

    expect(actualProfile.displayName).toBe('Front Desk');
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
