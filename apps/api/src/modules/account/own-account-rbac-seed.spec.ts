import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P20-T05 grant exists only as rows in `prisma/seed.sql`, which CI never
 * runs, so this reads the seed file itself rather than the database — the same
 * shape as `taxes-rbac-seed.spec.ts`. An integration test asserting these rows
 * passes on a seeded developer database and fails on CI's unseeded one, which
 * says nothing true about the grant either way.
 */
describe('Own-account RBAC seed (P20-T05)', () => {
  const PERMISSION_KEY = 'user.update:own';

  /**
   * Every human role that needs an explicit row. `SUPER_ADMIN` is absent on
   * purpose — it holds every key through the catalogue-wide grant, the way it
   * holds `user.offboard:any` — and so are the two service accounts, because
   * nobody is behind them to have a name.
   */
  const EXPECTED_ROLES: readonly string[] = [
    'ADMIN',
    'DOCTOR',
    'PHARMACIST',
    'PATIENT',
    'LAB_TECHNICIAN',
    'MIDWIFE',
  ];
  const EXPECTED_ABSENT_ROLES: readonly string[] = [
    'SUPER_ADMIN',
    'BPJS_ANTREAN_SYSTEM',
    'CUSTOMER_SERVICE_CHANNEL',
  ];

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function hasBinding(roleCode: string): boolean {
    return seedSql.includes(`('${roleCode}', '${PERMISSION_KEY}')`);
  }

  it('declares the permission with the User subject and OWN scope', () => {
    const permissionRow = seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${PERMISSION_KEY}'`));

    expect(permissionRow).toContain("'User', 'update', 'OWN'");
  });

  it.each(EXPECTED_ROLES)('grants it to %s', (roleCode) => {
    expect(hasBinding(roleCode)).toBe(true);
  });

  it.each(EXPECTED_ABSENT_ROLES)('writes no explicit row for %s', (roleCode) => {
    expect(hasBinding(roleCode)).toBe(false);
  });

  it('grants it wherever `auth.logout:own` is granted, and nowhere else', () => {
    // The precedent this grant follows: the existing key for "a thing anyone
    // signed in may do to themselves". Drifting apart would mean one of the
    // two is wrong.
    const rolesWithLogout = [...seedSql.matchAll(/\('([A-Z_]+)', 'auth\.logout:own'\)/g)].map(
      (match) => match[1],
    );
    const rolesWithRename = [...seedSql.matchAll(/\('([A-Z_]+)', 'user\.update:own'\)/g)].map(
      (match) => match[1],
    );

    expect(rolesWithRename.sort()).toEqual(rolesWithLogout.sort());
  });
});
