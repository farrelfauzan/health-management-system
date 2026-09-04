import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Offboarding is a super-admin action (`P16-T41`, §7.3.10.2), and this spec
 * is what keeps it one.
 *
 * `user.offboard:any` exists in the catalog — the guard needs a key to check
 * — but no seeded role is bound to it. SUPER_ADMIN holds it through the
 * catalog-wide grant alone. An ADMIN can deactivate; an ADMIN cannot open a
 * 30-day window of continued access for somebody, because that is the
 * decision this key gates and the seed withholds it on purpose. A future
 * binding added here fails this spec in the diff that adds it.
 *
 * Reads the seed file for the same reason the other RBAC seed specs do: CI
 * runs `migrate deploy` without ever seeding.
 */
describe('User offboarding RBAC seed', () => {
  const OFFBOARD_PERMISSION_KEY = 'user.offboard:any';
  const SEEDED_ROLE_CODES = ['ADMIN', 'DOCTOR', 'PATIENT', 'PHARMACIST', 'RECEPTIONIST'] as const;

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function findPermissionRow(permissionKey: string): string | undefined {
    return seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${permissionKey}'`));
  }

  it('defines the offboard key on the User resource at ANY scope', () => {
    const actualRow = findPermissionRow(OFFBOARD_PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    expect(actualRow).toContain(`'User'`);
    expect(actualRow).toContain(`'offboard'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it.each(SEEDED_ROLE_CODES)('binds it to no seeded role, including %s', (roleCode) => {
    expect(seedSql).not.toContain(`('${roleCode}', '${OFFBOARD_PERMISSION_KEY}')`);
  });

  it('leaves SUPER_ADMIN to hold it through the catalog-wide grant', () => {
    // Not an explicit binding either: the blanket grant is the one place a
    // super admin's rights come from, and listing this key by hand would
    // invite listing it for the next role too.
    expect(seedSql).not.toContain(`('SUPER_ADMIN', '${OFFBOARD_PERMISSION_KEY}')`);
    expect(seedSql).toContain(`SELECT 'SUPER_ADMIN'::text AS role_code`);
  });
});
