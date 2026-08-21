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
