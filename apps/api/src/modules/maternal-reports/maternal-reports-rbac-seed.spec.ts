import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P25-T15 grant exists only as rows in `prisma/seed.sql`, which CI never
 * runs, so this reads the seed file itself: one key on the `MaternalReport`
 * subject, held by the two clinician roles and by nobody else. ADMIN does not
 * get it (D-033: a register of every mother's visits, labs and births is
 * clinical record content), and the key sits in `clinical_content_keys` so
 * SUPER_ADMIN's catalogue-wide union stops short of it too.
 */
describe('Maternal report RBAC seed', () => {
  const PERMISSION_KEY = 'maternal-report.read:any';

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, boolean]> = [
    ['DOCTOR', true],
    ['MIDWIFE', true],
    ['ADMIN', false],
    ['PHARMACIST', false],
    ['PATIENT', false],
    ['LAB_TECHNICIAN', false],
  ];

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

  it('defines the key on the MaternalReport subject with ANY scope', () => {
    const actualRow = findPermissionRow(PERMISSION_KEY);

    expect(actualRow).toContain(`'MaternalReport'`);
    expect(actualRow).toContain(`'read'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it.each(EXPECTED_BINDINGS)('binds %s: %s', (roleCode, isGranted) => {
    expect(hasBinding(roleCode, PERMISSION_KEY)).toBe(isGranted);
  });

  it('keeps the key out of the SUPER_ADMIN union as clinical content (D-033)', () => {
    const clinicalBlock = seedSql.slice(
      seedSql.indexOf('clinical_content_keys(permission_key) AS ('),
      seedSql.indexOf('combined_role_permissions AS ('),
    );

    expect(clinicalBlock).toContain(`('${PERMISSION_KEY}')`);
  });
});
