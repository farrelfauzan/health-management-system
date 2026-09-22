import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `encounter.open` exists only as rows in `prisma/seed.sql`, which CI never
 * runs, so this reads the seed file itself. It pins the split that lets the
 * admin queue open a visit while D-033 keeps `encounter.write:any` from
 * SUPER_ADMIN: `:any` for whoever holds `encounter.write:any`, `:own` for
 * whoever holds `encounter.write:own`, and neither in the clinical-content set.
 */
describe('Encounter open RBAC seed', () => {
  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, string]> = [
    ['ADMIN', 'encounter.open:any'],
    ['DOCTOR', 'encounter.open:own'],
    ['MIDWIFE', 'encounter.open:own'],
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

  function readClinicalContentKeys(): string {
    const start = seedSql.indexOf('clinical_content_keys(permission_key) AS (');
    const end = seedSql.indexOf('combined_role_permissions AS (', start);

    return seedSql.slice(start, end);
  }

  it.each([
    ['encounter.open:any', 'ANY'],
    ['encounter.open:own', 'OWN'],
  ])('defines %s on the Encounter subject with scope %s', (permissionKey, scope) => {
    const actualRow = findPermissionRow(permissionKey);

    expect(actualRow).toContain(`'Encounter', 'open', '${scope}'`);
  });

  it.each(EXPECTED_BINDINGS)('grants %s %s', (roleCode, permissionKey) => {
    expect(hasBinding(roleCode, permissionKey)).toBe(true);
  });

  it.each(EXPECTED_BINDINGS)(
    'pairs %s %s with the matching encounter write grant',
    (roleCode, permissionKey) => {
      const writeKey = permissionKey.replace('encounter.open', 'encounter.write');

      expect(hasBinding(roleCode, writeKey)).toBe(true);
    },
  );

  it('keeps encounter.open out of the D-033 clinical-content set so SUPER_ADMIN holds it', () => {
    expect(readClinicalContentKeys()).not.toContain('encounter.open');
    expect(readClinicalContentKeys()).toContain(`('encounter.write:any')`);
  });

  it('never grants encounter.open to the patient', () => {
    expect(seedSql).not.toMatch(/\('PATIENT', 'encounter\.open:/);
  });
});
