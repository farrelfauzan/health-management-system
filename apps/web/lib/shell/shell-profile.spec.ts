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
      roleLabel: 'Super Admin',
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
      roleLabel: 'Admin',
      email: 'sarah.chen@salingjaga.com',
    });
  });

  it('falls back to defaults when claims are missing', () => {
    expect(resolveShellProfile(null)).toEqual({
      displayName: 'Saling Jaga User',
      roleLabel: 'Staff',
      email: '',
    });
  });
});
