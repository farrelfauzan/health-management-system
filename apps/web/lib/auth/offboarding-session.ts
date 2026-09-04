import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

/** The one page an offboarded person can still reach, per shell. */
export const OFFBOARDED_VAULT_PATHS = {
  admin: '/admin/vault',
  doctor: '/doctor/vault',
} as const;

export type OffboardedShell = keyof typeof OFFBOARDED_VAULT_PATHS;

export type OffboardingSession = {
  /** Clinic calendar day, `YYYY-MM-DD`. */
  readonly deadline: string;
  readonly vaultHref: string;
};

/**
 * Whether this session belongs to someone in their offboarding window
 * (P16-T41), and where their vault lives.
 *
 * Read from the session hint's `offboardedUntil`, which the API writes at
 * login from `User.offboardedAt`. Like every other claim read here it decides
 * what the shell renders — a banner, a one-entry sidebar, a redirect — and
 * nothing about what the API allows: `PermissionsGuard` branches on the
 * database row on every request, so a forged or stale hint buys a wrong
 * sidebar and no data.
 */
export function resolveOffboardingSession(
  claims: AccessTokenClaims | null,
  shell: OffboardedShell,
): OffboardingSession | null {
  if (!claims?.offboardedUntil) {
    return null;
  }
  return { deadline: claims.offboardedUntil, vaultHref: OFFBOARDED_VAULT_PATHS[shell] };
}
