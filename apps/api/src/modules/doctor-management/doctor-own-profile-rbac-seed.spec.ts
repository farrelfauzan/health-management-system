import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Who may edit a doctor profile (P20-T03).
 *
 * DOCTOR gets `doctor.update:own` so a doctor can correct their own name,
 * title, degrees, phone and education. It must never get the `:any` scope:
 * that is the key the administrative route and the credential catalog check
 * for, and holding it would let a doctor rewrite any colleague's credentials
 * — or their own specialty and STR, which D-025 keeps with the clinic.
 *
 * Reads the seed file directly rather than the database: CI runs
 * `migrate deploy` without seeding, so no integration spec can observe these
 * rows.
 */
describe('Doctor own-profile RBAC seed', () => {
  const OWN_UPDATE_KEY = 'doctor.update:own';
  const ANY_UPDATE_KEY = 'doctor.update:any';

  const ROLES_WITHOUT_OWN_UPDATE = ['PATIENT', 'PHARMACIST', 'LAB_TECHNICIAN'] as const;

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function findPermissionRow(permissionKey: string): string | undefined {
    return seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${permissionKey}'`));
  }

  function hasBinding(roleCode: string, permissionKey: string): boolean {
    return seedSql.includes(`('${roleCode}', '${permissionKey}')`);
  }

  it('defines the own-scope update key in the permission catalog', () => {
    const actualRow = findPermissionRow(OWN_UPDATE_KEY);

    expect(actualRow).toBeDefined();
    expect(actualRow).toContain("'Doctor'");
    expect(actualRow).toContain("'update'");
    expect(actualRow).toContain("'OWN'");
  });

  it('grants DOCTOR the own-scope update key', () => {
    expect(hasBinding('DOCTOR', OWN_UPDATE_KEY)).toBe(true);
  });

  it('never grants DOCTOR the any-scope update key', () => {
    expect(hasBinding('DOCTOR', ANY_UPDATE_KEY)).toBe(false);
  });

  it.each(ROLES_WITHOUT_OWN_UPDATE)('does not grant the own-scope update key to %s', (roleCode) => {
    expect(hasBinding(roleCode, OWN_UPDATE_KEY)).toBe(false);
  });
});
