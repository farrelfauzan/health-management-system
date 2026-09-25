import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BASELINE_ROLE_PERMISSION_KEYS } from '@hms/shared-types';

/**
 * Every seeded staff role carries the keys being signed in needs (P22-T03,
 * D-048): signing out, editing one's own name, the bell, the feature list and
 * the bug report. The catch-up block in `seed.sql` only repairs custom roles,
 * so a seeded role that is missing one stays missing it — LAB_TECHNICIAN had
 * no bell and no feature list until D-048 noticed.
 *
 * CI never seeds, so this reads the seed file. A role added to `seed_roles`
 * without the baseline fails here until someone decides it is not staff.
 */
describe('staff role baseline seed', () => {
  /** Machine accounts render no shell, and a patient is not staff. */
  const NON_STAFF_ROLE_CODES = ['PATIENT', 'BPJS_ANTREAN_SYSTEM', 'CUSTOMER_SERVICE_CHANNEL'];
  /** Holds every non-clinical key through the catalog-wide union instead of rows. */
  const UNION_ROLE_CODE = 'SUPER_ADMIN';
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function readSeededRoleCodes(): string[] {
    const start = seedSql.indexOf('WITH seed_roles(code, name, description) AS (');
    const end = seedSql.indexOf('INSERT INTO "roles"', start);
    const block = seedSql.slice(start, end);
    return [...block.matchAll(/^\s*\('([A-Z_]+)', '/gm)].map((match) => match[1] ?? '');
  }

  function readClinicalContentKeys(): string {
    const start = seedSql.indexOf('clinical_content_keys(permission_key) AS (');
    const end = seedSql.indexOf('combined_role_permissions AS (', start);
    return seedSql.slice(start, end);
  }

  const staffRoleCodes = readSeededRoleCodes().filter(
    (code) => !NON_STAFF_ROLE_CODES.includes(code) && code !== UNION_ROLE_CODE,
  );

  it('finds the seeded staff roles, including the lab bench', () => {
    expect(staffRoleCodes).toEqual(
      expect.arrayContaining(['ADMIN', 'DOCTOR', 'PHARMACIST', 'LAB_TECHNICIAN', 'MIDWIFE']),
    );
  });

  it.each(staffRoleCodes)('grants %s every baseline key', (roleCode) => {
    const actualMissingKeys = BASELINE_ROLE_PERMISSION_KEYS.filter(
      (key) => !seedSql.includes(`('${roleCode}', '${key}')`),
    );

    expect(actualMissingKeys).toEqual([]);
  });

  it('leaves every baseline key inside the SUPER_ADMIN union', () => {
    const clinicalContentKeys = readClinicalContentKeys();

    for (const key of BASELINE_ROLE_PERMISSION_KEYS) {
      expect(clinicalContentKeys).not.toContain(`('${key}')`);
    }
  });
});
