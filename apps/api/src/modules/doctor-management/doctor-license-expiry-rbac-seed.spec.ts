import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Who may read the licence expiry roster (`P16-T19`).
 *
 * The ticket said to reuse the existing doctor-management read grant and add
 * no new key. That would have been wrong here, and the reason is visible in
 * the seed: `doctor.read:any` is held by DOCTOR and PATIENT as well as ADMIN,
 * because the doctor directory is something patients browse when choosing who
 * to book with. Hanging the expiry dashboard off that key would have let any
 * logged-in patient pull a list of which practitioners are out of licence.
 *
 * So the dashboard gets its own key, seeded to ADMIN alone, and this spec is
 * what keeps that true — a future role edit that hands
 * `doctor.license-expiry.read:any` to PATIENT or DOCTOR fails here.
 *
 * Reads the seed file directly rather than the database: CI runs
 * `migrate deploy` without seeding, so no integration spec can observe these
 * rows.
 */
describe('Doctor licence expiry RBAC seed', () => {
  const EXPIRY_PERMISSION_KEY = 'doctor.license-expiry.read:any';

  const ROLES_WITHOUT_THE_KEY = ['DOCTOR', 'PATIENT', 'PHARMACIST', 'RECEPTIONIST'] as const;

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

  it('defines the expiry dashboard key in the permission catalog', () => {
    const actualRow = findPermissionRow(EXPIRY_PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    expect(actualRow).toContain("'DoctorLicenseExpiry'");
    expect(actualRow).toContain("'read'");
    expect(actualRow).toContain("'ANY'");
  });

  it('grants the expiry dashboard to ADMIN', () => {
    expect(hasBinding('ADMIN', EXPIRY_PERMISSION_KEY)).toBe(true);
  });

  it.each(ROLES_WITHOUT_THE_KEY)('does not grant the expiry dashboard to %s', (roleCode) => {
    expect(hasBinding(roleCode, EXPIRY_PERMISSION_KEY)).toBe(false);
  });

  it('still lets DOCTOR and PATIENT read the doctor directory, which is a different question', () => {
    expect(hasBinding('DOCTOR', 'doctor.read:any')).toBe(true);
    expect(hasBinding('PATIENT', 'doctor.read:any')).toBe(true);
  });
});
