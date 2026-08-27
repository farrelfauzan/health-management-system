import { packPermissionHint } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { resolveSessionClaims } from './session-claims';

function buildToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature-not-checked-here`;
}

function buildHint(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('resolveSessionClaims', () => {
  const futureExp = Math.floor(Date.now() / 1000) + 600;
  const pastExp = Math.floor(Date.now() / 1000) - 600;

  it('prefers the access token for identity', () => {
    const claims = resolveSessionClaims({
      accessToken: buildToken({ roles: ['ADMIN'], exp: futureExp }),
      sessionHint: buildHint({ roles: ['DOCTOR'], exp: futureExp }),
    });

    expect(claims?.roles).toEqual(['ADMIN']);
  });

  it('merges the hint disabled features onto a live access token', () => {
    // IMP-9's load-bearing case: the token is fresh, so it wins on identity —
    // but it carries no feature information, and without the merge the shell
    // would render with nothing hidden in the one case that always happens.
    const claims = resolveSessionClaims({
      accessToken: buildToken({ roles: ['ADMIN'], exp: futureExp }),
      sessionHint: buildHint({
        roles: ['ADMIN'],
        disabledFeatures: ['ai-chatbot'],
        exp: futureExp,
      }),
    });

    expect(claims?.roles).toEqual(['ADMIN']);
    expect(claims?.disabledFeatures).toEqual(['ai-chatbot']);
  });

  it('merges the hint permissions onto a live access token', () => {
    // The load-bearing case for the cookie-size split. The token carries only
    // `portal.*` now — the full set moved to the hint because 127 keys made
    // the token 4229 bytes against a 4096-byte cookie limit, and the browser
    // dropped it. Without this merge a fresh token yields a `portal.*`-only
    // claim, which maps to no CASL rule, and every admin gate falls back to a
    // hardcoded preset.
    const claims = resolveSessionClaims({
      accessToken: buildToken({
        roles: ['SUPER_ADMIN'],
        permissions: ['portal.admin-access:any'],
        exp: futureExp,
      }),
      sessionHint: buildHint({
        roles: ['SUPER_ADMIN'],
        permissions: ['portal.admin-access:any'],
        packedPermissions: packPermissionHint(['role.create:any', 'patient.read:any']),
        exp: futureExp,
      }),
    });

    // Scope kept on the portal key for `proxy.ts`; stripped on the rest,
    // which is all `resolveAppAbilityRules` ever looks at.
    expect(claims?.permissions).toContain('portal.admin-access:any');
    expect(claims?.permissions).toContain('role.create');
    expect(claims?.permissions).toContain('patient.read');
  });

  it('does not duplicate a permission carried by both sides', () => {
    const claims = resolveSessionClaims({
      accessToken: buildToken({
        roles: ['ADMIN'],
        permissions: ['portal.admin-access:any'],
        exp: futureExp,
      }),
      sessionHint: buildHint({
        roles: ['ADMIN'],
        permissions: ['portal.admin-access:any'],
        exp: futureExp,
      }),
    });

    expect(claims?.permissions).toEqual(['portal.admin-access:any']);
  });

  it('keeps a live token usable when the hint carries no packed permissions', () => {
    // An old hint, written before the split. The shell still resolves from the
    // portal key and the ability falls back to the role preset, exactly as it
    // did before — no crash, no blank menu.
    const claims = resolveSessionClaims({
      accessToken: buildToken({
        roles: ['ADMIN'],
        permissions: ['portal.admin-access:any'],
        exp: futureExp,
      }),
      sessionHint: buildHint({ roles: ['ADMIN'], exp: futureExp }),
    });

    expect(claims?.permissions).toEqual(['portal.admin-access:any']);
  });

  it('reports no disabled features when the hint is absent', () => {
    const claims = resolveSessionClaims({
      accessToken: buildToken({ roles: ['ADMIN'], exp: futureExp }),
    });

    expect(claims?.disabledFeatures).toEqual([]);
  });

  it('reports no disabled features for a hint issued before the field existed', () => {
    const claims = resolveSessionClaims({
      accessToken: buildToken({ roles: ['ADMIN'], exp: futureExp }),
      sessionHint: buildHint({ roles: ['ADMIN'], exp: futureExp }),
    });

    expect(claims?.disabledFeatures).toEqual([]);
  });

  it('falls back to the hint, features included, once the token has expired', () => {
    const claims = resolveSessionClaims({
      accessToken: buildToken({ roles: ['ADMIN'], exp: pastExp }),
      sessionHint: buildHint({
        roles: ['ADMIN'],
        disabledFeatures: ['billing'],
        exp: futureExp,
      }),
    });

    expect(claims?.disabledFeatures).toEqual(['billing']);
  });

  it('returns null when both sides have expired', () => {
    expect(
      resolveSessionClaims({
        accessToken: buildToken({ roles: ['ADMIN'], exp: pastExp }),
        sessionHint: buildHint({ roles: ['ADMIN'], exp: pastExp }),
      }),
    ).toBeNull();
  });
});
