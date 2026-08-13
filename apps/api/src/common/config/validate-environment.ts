/**
 * Values that must never be a real secret. Every one of them was, at some
 * point, a fallback compiled into this codebase (SJ-5) — which is exactly how
 * a placeholder reaches production: not because someone typed it, but because
 * nobody typed anything. They stay usable in development and CI, where a
 * shared well-known value is the point, and are refused in production.
 */
const FORBIDDEN_PRODUCTION_SECRETS: readonly string[] = [
  'dev-access-secret',
  'dev-refresh-secret',
  'replace-with-strong-secret',
  'changeme',
  'secret',
];

/**
 * Shortest secret worth calling one. Below this, an HMAC key is guessable
 * faster than it is rotatable.
 */
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

/**
 * Environment keys the API refuses to start without. Deliberately short: a
 * secret belongs here only if the application cannot serve a single request
 * without it. Everything feature-gated — S3, SATUSEHAT, BPJS, the AI provider
 * — is validated by its own config service at the point of use, so a clinic
 * running without those integrations still boots.
 */
const REQUIRED_KEYS: readonly string[] = ['DATABASE_URL', 'JWT_ACCESS_SECRET'];

/**
 * Required keys that are secrets, and so face the extra production checks.
 *
 * `JWT_REFRESH_SECRET` left this list with SJ-6: refresh tokens became opaque
 * random strings validated against a stored hash, so nothing signs them and
 * there is no key to be weak. A deployment that still sets it is harmless —
 * the value is simply never read.
 */
const REQUIRED_SECRET_KEYS: readonly string[] = ['JWT_ACCESS_SECRET'];

/**
 * Keys required in production only (SJ-8).
 *
 * `MFA_SECRET_ENCRYPTION_KEY` is here rather than in `REQUIRED_KEYS` because
 * the alternative failure is worse than a missing key. Without it nobody can
 * enrol a second factor, so `MfaEnforcementService` has to leave enforcement
 * off — otherwise the first deployment after this ticket locks every
 * administrator out of the clinic with no recovery path short of an operator
 * editing the database. Failing open is the right call for that hour and the
 * wrong call for a year, so production refuses to boot instead, and
 * development and CI — which run thousands of tests that never reach MFA —
 * carry on without the key.
 */
const PRODUCTION_REQUIRED_KEYS: readonly string[] = ['MFA_SECRET_ENCRYPTION_KEY'];

/**
 * Fails startup when a required secret is absent, and — in production — when
 * it is present but worthless (SJ-5).
 *
 * Runs as `ConfigModule`'s `validate` hook, before any provider is
 * constructed, so the process dies at boot with a readable list rather than at
 * the first request with a 500. It replaces six `?? 'dev-access-secret'`
 * fallbacks: a fallback turns a missing secret into a *working* deployment
 * signed with a value published in this repository, and a deployment that
 * works is one nobody investigates.
 *
 * Unknown keys pass through untouched — the API reads dozens of optional
 * settings, so this is a floor, not an allowlist.
 */
export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const problems = [
    ...collectMissingKeys(config),
    ...collectMissingProductionKeys(config),
    ...collectWeakProductionSecrets(config),
  ];
  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }
  return config;
}

function collectMissingKeys(config: Record<string, unknown>): string[] {
  return REQUIRED_KEYS.filter((key) => !readNonEmptyString(config, key)).map(
    (key) => `${key} is required but missing or empty`,
  );
}

function collectMissingProductionKeys(config: Record<string, unknown>): string[] {
  if (config.NODE_ENV !== 'production') {
    return [];
  }
  return PRODUCTION_REQUIRED_KEYS.filter((key) => !readNonEmptyString(config, key)).map(
    (key) => `${key} is required in production but missing or empty`,
  );
}

function collectWeakProductionSecrets(config: Record<string, unknown>): string[] {
  if (config.NODE_ENV !== 'production') {
    return [];
  }
  return REQUIRED_SECRET_KEYS.flatMap((key) => {
    const value = readNonEmptyString(config, key);
    if (value === undefined) {
      return [];
    }
    if (FORBIDDEN_PRODUCTION_SECRETS.includes(value)) {
      return [`${key} is a known placeholder value and must not be used in production`];
    }
    if (value.length < MINIMUM_PRODUCTION_SECRET_LENGTH) {
      return [
        `${key} must be at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters in production`,
      ];
    }
    return [];
  });
}

function readNonEmptyString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
