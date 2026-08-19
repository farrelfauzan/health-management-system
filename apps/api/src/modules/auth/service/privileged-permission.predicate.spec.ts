import { findPrivilegedPermissions } from './privileged-permission.predicate';

describe('findPrivilegedPermissions (SJ-8)', () => {
  it('treats an account with only clinical permissions as unprivileged', () => {
    const inputPermissions = [
      'patient.read:any',
      'encounter.write:any',
      'prescription.write:any',
      'appointment.create:any',
      'dispense.write:any',
      'auth.logout:own',
    ];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual([]);
  });

  it('matches administrative control permissions', () => {
    const inputPermissions = ['patient.read:any', 'role.assign:any', 'user.create:any'];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual(['role.assign:any', 'user.create:any']);
  });

  it('treats role lifecycle permissions as privileged (IMP-2)', () => {
    const inputPermissions = [
      'role.read:any',
      'role.create:any',
      'role.update:any',
      'role.delete:any',
    ];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual(['role.create:any', 'role.delete:any', 'role.update:any']);
  });

  it('matches a nested manage permission at any scope depth', () => {
    const inputPermissions = ['bpjs.config.manage:any', 'bpjs.reference.read:any'];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual(['bpjs.config.manage:any']);
  });

  it('requires MFA for a permission that does not exist yet, purely from its shape', () => {
    // SJ-8 acceptance: grant an export permission to a fresh role and MFA
    // becomes required, with no change to this list.
    const inputPermissions = ['patient.read:own', 'registration.export:any'];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual(['registration.export:any']);
  });

  it('never lets a wildcard span a separator', () => {
    // `*.export:any` must not match this: a greedy wildcard would swallow
    // `read` and make every `:any` read permission privileged.
    const inputPermissions = ['patient.read:any'];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual([]);
  });

  it('distinguishes manage:own from manage:any', () => {
    const inputPermissions = ['clinic.manage:own'];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual([]);
  });

  it('matches case-insensitively, so a scope written ANY still counts', () => {
    const inputPermissions = ['audit.read:ANY'];

    const actualMatches = findPrivilegedPermissions(inputPermissions);

    expect(actualMatches).toEqual(['audit.read:ANY']);
  });

  it('returns an empty list for an account with no permissions at all', () => {
    const actualMatches = findPrivilegedPermissions([]);

    expect(actualMatches).toEqual([]);
  });
});
