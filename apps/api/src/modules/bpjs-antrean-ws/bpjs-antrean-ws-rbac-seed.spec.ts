import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The reserved system actor and its grants exist only as rows in
 * `prisma/seed.sql`, and CI runs `migrate deploy` without ever seeding — so no
 * integration spec can observe them. This reads the seed file, which is the
 * artifact that ships.
 *
 * The assertions run in both directions on purpose. A missing grant is an
 * outage: Mobile JKN bookings 403 on the next fresh database. An *extra* grant
 * is a security regression: it widens what a caller from the public internet
 * reaches if the token check is ever defeated. The second is the reason this
 * file asserts an exact set rather than a subset.
 */
describe('BPJS Antrean inbound RBAC seed', () => {
  const SYSTEM_ROLE_CODE = 'BPJS_ANTREAN_SYSTEM';
  const SYSTEM_ACCOUNT_EMAIL = 'bpjs-antrean-bridge@system.hms.local';

  const EXPECTED_GRANTS = [
    'appointment.cancel:any',
    'appointment.create:any',
    'appointment.read:any',
    'appointment.session.read:any',
    'patient.create:any',
    'patient.read:any',
  ] as const;

  /**
   * Grants that must never appear on this role. Enumerated rather than left
   * implicit because each one is a specific thing the public surface must not
   * be able to do, and a future permission sweep that adds them should fail
   * here rather than in production.
   */
  const FORBIDDEN_GRANTS = [
    // The bridge matches members through the blind index; it never decrypts a
    // NIK or a card number.
    'patient.read-identifier:any',
    'patient.import-identifier:any',
    // A Mobile JKN booking is an appointment. Check-in stays a human act at
    // the counter.
    'registration.create:any',
    'registration.update:any',
    // Nothing clinical, ever.
    'encounter.write:any',
    'prescription.write:any',
    // It must not be able to grant itself anything.
    'role.assign:any',
    'user.create:any',
    // Credential custody stays with admins.
    'bpjs.config.manage:any',
  ] as const;

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function hasBinding(permissionKey: string): boolean {
    return seedSql.includes(`('${SYSTEM_ROLE_CODE}', '${permissionKey}')`);
  }

  it('defines the reserved role', () => {
    expect(seedSql).toContain(`('${SYSTEM_ROLE_CODE}', 'BPJS Antrean Bridge'`);
  });

  it('provisions the reserved account as a system account', () => {
    expect(seedSql).toContain(SYSTEM_ACCOUNT_EMAIL);
    // `is_system` is what the login path refuses on. Without it the account is
    // an ordinary user whose password an admin could set.
    expect(seedSql).toMatch(/'!no-login:bpjs-antrean-bridge'/);
  });

  it('grants exactly the six inbound services and nothing more', () => {
    // Matches only permission-key rows (`resource.action:scope`), so the role
    // definition line — which shares the leading tuple shape — is not counted.
    const grantPattern = new RegExp(`^\\('${SYSTEM_ROLE_CODE}', '([a-z0-9.\\-]+:[a-z]+)'\\),?$`);
    const actualGranted = seedSql
      .split('\n')
      .map((line) => grantPattern.exec(line.trim())?.[1])
      .filter((permissionKey): permissionKey is string => permissionKey !== undefined);

    expect(actualGranted.sort()).toEqual([...EXPECTED_GRANTS].sort());
  });

  it.each(FORBIDDEN_GRANTS)('withholds %s from the bridge', (permissionKey) => {
    expect(hasBinding(permissionKey)).toBe(false);
  });
});
