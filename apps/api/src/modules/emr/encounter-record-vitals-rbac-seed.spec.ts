import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BASELINE_ROLE_PERMISSION_KEYS } from '@hms/shared-types';

/**
 * `encounter.record-vitals:any` and the custom-role baseline backfill exist
 * only as rows in `prisma/seed.sql`, which CI never runs, so this reads the
 * seed file itself (P22-T03).
 */
describe('Encounter record-vitals RBAC seed', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function findPermissionRow(permissionKey: string): string | undefined {
    return seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${permissionKey}'`));
  }

  function readClinicalContentKeys(): string {
    const start = seedSql.indexOf('clinical_content_keys(permission_key) AS (');
    const end = seedSql.indexOf('combined_role_permissions AS (', start);
    return seedSql.slice(start, end);
  }

  function readBaselineBackfill(): string {
    const start = seedSql.indexOf('JOIN "permissions" p ON p."permission_key" IN (');
    const end = seedSql.indexOf('WHERE r."is_system" = false', start);
    return seedSql.slice(start, end);
  }

  it('defines encounter.record-vitals:any on the Encounter subject', () => {
    const actualRow = findPermissionRow('encounter.record-vitals:any');

    expect(actualRow).toContain(`'Encounter', 'record-vitals', 'ANY'`);
  });

  it('keeps it out of the SUPER_ADMIN union as D-033 clinical content', () => {
    expect(readClinicalContentKeys()).toContain(`('encounter.record-vitals:any')`);
  });

  it('binds it to no seeded role, since every seeded measurer already holds encounter.write', () => {
    expect(seedSql).not.toMatch(/\('[A-Z_]+', 'encounter\.record-vitals:any'\)/);
  });

  it('backfills exactly the shared baseline keys onto custom roles', () => {
    const backfill = readBaselineBackfill();
    const actualKeys = [...backfill.matchAll(/'([a-z.-]+:own)'/g)].map((match) => match[1]);

    expect(actualKeys).toEqual([...BASELINE_ROLE_PERMISSION_KEYS]);
  });

  it.each([...BASELINE_ROLE_PERMISSION_KEYS])('%s is a real catalogue permission', (key) => {
    expect(findPermissionRow(key)).toBeDefined();
  });

  it('defines encounter.read-summary:any, grants it to ADMIN, and keeps it out of D-033 (P22-T05)', () => {
    expect(findPermissionRow('encounter.read-summary:any')).toContain(
      `'Encounter', 'read-summary', 'ANY'`,
    );
    expect(seedSql).toContain(`('ADMIN', 'encounter.read-summary:any')`);
    expect(readClinicalContentKeys()).not.toContain('encounter.read-summary');
  });
});

