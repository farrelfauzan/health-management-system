import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The poli grant and the Kebidanan row exist only in `prisma/seed.sql`, and CI
 * never seeds — so no integration spec can observe them. This reads the file
 * that ships instead.
 */
describe('Specialty seed', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function findPermissionRow(permissionKey: string): string | undefined {
    return seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${permissionKey}'`));
  }

  function extractSpecialtyBlock(): string {
    const start = seedSql.indexOf('WITH seed_specialties(name) AS (');
    const end = seedSql.indexOf(';', start);
    return seedSql.slice(start, end);
  }

  it('defines specialty.manage:any on the Specialty subject', () => {
    const actualRow = findPermissionRow('specialty.manage:any');

    expect(actualRow).toContain(`'Specialty', 'manage', 'ANY'`);
  });

  it.each([
    ['ADMIN', true],
    ['DOCTOR', false],
    ['MIDWIFE', false],
    ['PHARMACIST', false],
    ['PATIENT', false],
  ])('grants %s specialty.manage:any: %s', (roleCode, expected) => {
    expect(seedSql.includes(`('${roleCode}', 'specialty.manage:any')`)).toBe(expected);
  });

  it('seeds Kebidanan beside the existing poli', () => {
    expect(extractSpecialtyBlock()).toContain(`('Kebidanan')`);
    expect(extractSpecialtyBlock()).toContain(`('Obstetrics & Gynecology')`);
  });

  // A re-seed must not revive a poli the clinic deactivated, nor collide with
  // a seeded row the clinic renamed (same derived id, different name).
  it('only ever inserts, and skips a seeded row the clinic renamed', () => {
    const actualBlock = extractSpecialtyBlock();

    expect(actualBlock).toContain('ON CONFLICT ("name") DO NOTHING');
    expect(actualBlock).not.toContain('DO UPDATE');
    expect(actualBlock).toMatch(/WHERE NOT EXISTS \(\s*SELECT 1 FROM "specialties" existing/);
  });
});
