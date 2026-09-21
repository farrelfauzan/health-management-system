import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P27-T06 grants exist only as rows in `prisma/seed.sql`, which CI never
 * runs, so this reads the seed file itself: both keys on the `ClinicianFee`
 * subject, granted to ADMIN and to no clinical or patient role. SUPER_ADMIN
 * holds them through the catalog-wide union.
 */
describe('Clinician fee RBAC seed', () => {
  const CLINICIAN_FEE_PERMISSION_KEYS = [
    'clinician-fee.read:any',
    'clinician-fee.write:any',
  ] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['ADMIN', ['clinician-fee.read:any', 'clinician-fee.write:any']],
    ['DOCTOR', []],
    ['MIDWIFE', []],
    ['PHARMACIST', []],
    ['PATIENT', []],
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

  it.each(CLINICIAN_FEE_PERMISSION_KEYS)(
    'defines %s on the ClinicianFee subject with ANY scope',
    (permissionKey) => {
      const actualRow = findPermissionRow(permissionKey);

      expect(actualRow).toContain(`'ClinicianFee'`);
      expect(actualRow).toContain(`'ANY'`);
    },
  );

  it.each(EXPECTED_BINDINGS)(
    'grants %s exactly its clinician-fee permissions',
    (roleCode, granted) => {
      const actualGranted = CLINICIAN_FEE_PERMISSION_KEYS.filter((permissionKey) =>
        hasBinding(roleCode, permissionKey),
      );

      expect(actualGranted).toEqual([...granted]);
    },
  );
});
