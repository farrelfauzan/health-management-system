import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P25-T16 grants exist only as rows in `prisma/seed.sql`, which CI never
 * runs, so this reads the seed file itself: two keys on the
 * `BpjsNonCapitation` subject, held by ADMIN alone among the clinic roles.
 * This is D-033's billing-line opening, so the keys are **not** clinical
 * content and SUPER_ADMIN's catalogue-wide union carries them too.
 */
describe('BPJS non-capitation RBAC seed', () => {
  const PERMISSION_KEYS = ['bpjs.non-capitation.read:any', 'bpjs.non-capitation.write:any'];

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, boolean]> = [
    ['ADMIN', true],
    ['DOCTOR', false],
    ['MIDWIFE', false],
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

  it.each(PERMISSION_KEYS)('defines %s on the BpjsNonCapitation subject with ANY scope', (key) => {
    const actualRow = findPermissionRow(key);

    expect(actualRow).toContain(`'BpjsNonCapitation'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it.each(EXPECTED_BINDINGS)('binds %s: %s', (roleCode, isGranted) => {
    PERMISSION_KEYS.forEach((key) => {
      expect(seedSql.includes(`('${roleCode}', '${key}')`)).toBe(isGranted);
    });
  });

  it('keeps the keys out of the clinical-content list (billing line, D-033)', () => {
    const clinicalBlock = seedSql.slice(
      seedSql.indexOf('clinical_content_keys(permission_key) AS ('),
      seedSql.indexOf('combined_role_permissions AS ('),
    );

    PERMISSION_KEYS.forEach((key) => {
      expect(clinicalBlock).not.toContain(`('${key}')`);
    });
  });

  it('seeds every non-capitation tariff with a Permenkes 3/2023 page reference', () => {
    const tariffBlock = seedSql.slice(
      seedSql.indexOf('WITH seed_non_capitation_tariffs'),
      seedSql.indexOf('FROM seed_non_capitation_tariffs'),
    );
    const actualRows = tariffBlock.split('\n').filter((line) => line.trim().startsWith("('"));

    expect(actualRows).toHaveLength(11);
    actualRows.forEach((row) =>
      expect(row).toMatch(/Permenkes 3\/2023 Pasal (19|20|21|22) .*hlm\. 1[3-6]/),
    );
  });
});
