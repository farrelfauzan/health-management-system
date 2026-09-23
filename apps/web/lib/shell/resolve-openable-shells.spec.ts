import { describe, expect, it } from 'vitest';

import { resolveOpenableShells } from '#lib/shell/resolve-openable-shells';

describe('resolveOpenableShells (P22-T05)', () => {
  it('lists every shell a custom role holds a portal key for, admin first', () => {
    expect(
      resolveOpenableShells({
        roles: ['FRONT_NURSE'],
        permissions: ['portal.doctor-access:any', 'portal.admin-access:any'],
      }),
    ).toEqual(['ADMIN', 'DOCTOR']);
  });

  it('keeps SUPER_ADMIN on the admin shell', () => {
    expect(
      resolveOpenableShells({
        roles: ['SUPER_ADMIN'],
        permissions: [
          'portal.admin-access:any',
          'portal.doctor-access:any',
          'portal.patient-access:own',
        ],
      }),
    ).toEqual(['ADMIN']);
  });

  it('falls back to seeded role codes for sessions without portal keys', () => {
    expect(resolveOpenableShells({ roles: ['MIDWIFE'] })).toEqual(['DOCTOR']);
  });

  it('opens nothing without a session', () => {
    expect(resolveOpenableShells(null)).toEqual([]);
  });
});
