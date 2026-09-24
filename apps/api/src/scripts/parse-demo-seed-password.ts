import { passwordPolicySchema } from '@hms/shared-types';

/**
 * Reads the one password every demo login shares, from `DEMO_SEED_PASSWORD`.
 *
 * It is never a default and never a fixture: the repository is public, so a
 * password written into it is a password for every deployment somebody
 * forgot to reseed. The same policy the account screens enforce applies here,
 * so a demo login is never one the product itself would have refused.
 *
 * The messages name the rule that failed and never echo the value.
 */
export function parseDemoSeedPassword(rawValue: string | undefined): string {
  if (rawValue === undefined || rawValue.trim() === '') {
    throw new Error('DEMO_SEED_PASSWORD is required: every demo login signs in with it');
  }
  const parsed = passwordPolicySchema.safeParse(rawValue);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`DEMO_SEED_PASSWORD does not meet the password policy: ${reasons}`);
  }
  return parsed.data;
}
