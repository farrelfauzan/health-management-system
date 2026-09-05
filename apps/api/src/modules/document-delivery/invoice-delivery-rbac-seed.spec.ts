import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `invoice.deliver:any` (P16-T25) exists only as rows in `prisma/seed.sql`,
 * and CI runs `migrate deploy` without ever seeding — so no integration spec
 * can observe it. This reads the seed file instead: it is the artifact that
 * ships, and a delivery permission silently dropped from it is a send button
 * nobody can press on the next fresh database.
 *
 * The bindings are the point. Delivery is deliberately not granted to the
 * doctor or the patient, and not folded into `invoice.write:any` (§7.4.10).
 */
describe('Invoice delivery RBAC seed', () => {
  const PERMISSION_KEY = 'invoice.deliver:any';

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, boolean]> = [
    ['ADMIN', true],
    ['DOCTOR', false],
    ['PHARMACIST', false],
    ['PATIENT', false],
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

  it('defines the permission in the catalog as an ANY-scoped Invoice action', () => {
    const actualRow = findPermissionRow(PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    expect(actualRow).toContain(`'Invoice'`);
    expect(actualRow).toContain(`'deliver'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it.each(EXPECTED_BINDINGS)('binds %s: %s', (roleCode, isGranted) => {
    expect(hasBinding(roleCode, PERMISSION_KEY)).toBe(isGranted);
  });
});
