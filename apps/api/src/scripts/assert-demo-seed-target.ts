import { DemoRoleCode, DemoSeedTargetInput } from './seed-demo.types';

/** Every role the demo signs in as, plus the one the seed acts through while it sets them up. */
const REQUIRED_ROLE_CODES: readonly (DemoRoleCode | 'SUPER_ADMIN')[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'MIDWIFE',
  'LAB_TECHNICIAN',
  'PHARMACIST',
];

const BASE_SEED_HINT = 'run `pnpm db:migrate:deploy && pnpm db:seed` first';

/**
 * Refuses to write demo data anywhere it does not belong.
 *
 * `NODE_ENV=production` is refused outright: demo logins share one password
 * and demo patients are invented people, and neither may ever sit in a live
 * clinic's records. Called once before the application context boots, with
 * only `nodeEnv`, so a production shell never starts the app at all; and
 * again with the database facts, which check the base seed is in place — the
 * demo seed builds on its roles and its privacy notice rather than inventing
 * them, so a database without them is the wrong database, not one to fill in.
 */
export function assertDemoSeedTarget(input: DemoSeedTargetInput): void {
  if (input.nodeEnv === 'production') {
    throw new Error('Refusing to seed demo data: NODE_ENV is production');
  }
  if (input.database === undefined) {
    return;
  }
  const { presentRoleCodes, hasPrivacyNotice } = input.database;
  const missingRoleCodes = REQUIRED_ROLE_CODES.filter(
    (roleCode) => !presentRoleCodes.includes(roleCode),
  );
  if (missingRoleCodes.length > 0) {
    throw new Error(
      `Refusing to seed demo data: roles ${missingRoleCodes.join(', ')} are missing; ${BASE_SEED_HINT}`,
    );
  }
  if (!hasPrivacyNotice) {
    throw new Error(`Refusing to seed demo data: no current privacy notice; ${BASE_SEED_HINT}`);
  }
}
