import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { packPermissionHint, unpackPermissionHint } from '@hms/shared-types';

/**
 * The cap that started all this. A cookie whose `name=value` exceeds 4096
 * bytes is silently discarded by the browser, and the failure is invisible:
 * the page renders, API calls still succeed, and only the visibility gates
 * quietly degrade to a fallback preset.
 */
const BROWSER_COOKIE_CAP_BYTES = 4096;
/**
 * Deliberately well under the cap. The point of a guard is to fail while there
 * is still room to think, not on the byte that breaks production — a seed that
 * doubles the catalogue should turn a build red, not a menu blank.
 */
const HINT_BUDGET_BYTES = 3000;
const HINT_COOKIE_NAME_BYTES = 'hms_session_hint='.length;

function readSeededPermissionKeys(): string[] {
  const seedPath = join(process.cwd(), '../../apps/api/prisma/seed.sql');
  const seed = readFileSync(seedPath, 'utf8');
  const keys = [...seed.matchAll(/\('([a-z0-9.-]+:(?:any|own))',\s*'[A-Za-z]/g)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1]]),
  );
  return [...new Set(keys)].sort();
}

function measureHintCookieBytes(permissionKeys: readonly string[]): number {
  const payload = JSON.stringify({
    roles: ['SUPER_ADMIN'],
    permissions: permissionKeys.filter((key) => key.startsWith('portal.')),
    packedPermissions: packPermissionHint(permissionKeys),
    disabledFeatures: [],
    exp: 1787812476,
  });
  return Buffer.from(payload).toString('base64url').length + HINT_COOKIE_NAME_BYTES;
}

describe('packPermissionHint / unpackPermissionHint', () => {
  it('round-trips a permission set minus the scope suffix', () => {
    const inputKeys = ['patient.read:any', 'patient.create:any', 'role.create:any'];

    const actualKeys = unpackPermissionHint(packPermissionHint(inputKeys)).sort();

    expect(actualKeys).toEqual(['patient.create', 'patient.read', 'role.create']);
  });

  it('collapses the two scopes of one grant into a single entry', () => {
    // `resolveAppAbilityRules` discards the scope, so carrying both spellings
    // would cost bytes and buy nothing.
    const actualKeys = unpackPermissionHint(
      packPermissionHint(['patient.read:any', 'patient.read:own']),
    );

    expect(actualKeys).toEqual(['patient.read']);
  });

  it('preserves dotted resources rather than flattening them', () => {
    // `appointment.session` and `appointment` are different CASL subjects; a
    // codec that lost the distinction would widen a session grant into an
    // appointment grant.
    const actualKeys = unpackPermissionHint(
      packPermissionHint(['appointment.session.update:any', 'appointment.update:any']),
    ).sort();

    expect(actualKeys).toEqual(['appointment.session.update', 'appointment.update']);
  });

  it('degrades to a smaller set on malformed input instead of throwing', () => {
    // The input is a cookie, so it is attacker-controlled by definition.
    expect(unpackPermissionHint('')).toEqual([]);
    expect(unpackPermissionHint(';;')).toEqual([]);
    expect(unpackPermissionHint('patient:')).toEqual([]);
    expect(unpackPermissionHint(':read')).toEqual([]);
    expect(unpackPermissionHint('patient:read;garbage')).toEqual(['patient.read']);
  });

  it('drops keys with no resource segment', () => {
    expect(packPermissionHint(['notaresource', '.leading', 'trailing.'])).toEqual('');
  });
});

describe('session-hint cookie budget', () => {
  it('keeps the whole seeded catalogue inside the cookie budget', () => {
    // The regression guard. SUPER_ADMIN holds every permission in the
    // catalogue through seed.sql's blanket grant, so this is the worst case
    // any real session can produce.
    const seededKeys = readSeededPermissionKeys();

    const actualBytes = measureHintCookieBytes(seededKeys);

    expect(seededKeys.length).toBeGreaterThan(100);
    expect(actualBytes).toBeLessThan(HINT_BUDGET_BYTES);
    expect(actualBytes).toBeLessThan(BROWSER_COOKIE_CAP_BYTES);
  });

  it('shows the packing is what buys the headroom', () => {
    // Without it the same set lands over the cap — which is exactly what
    // shipped, and exactly what nobody saw.
    const seededKeys = readSeededPermissionKeys();
    const unpackedPayload = JSON.stringify({
      roles: ['SUPER_ADMIN'],
      permissions: seededKeys,
      disabledFeatures: [],
      exp: 1787812476,
    });

    const unpackedBytes =
      Buffer.from(unpackedPayload).toString('base64url').length + HINT_COOKIE_NAME_BYTES;

    expect(unpackedBytes).toBeGreaterThan(measureHintCookieBytes(seededKeys));
  });
});
