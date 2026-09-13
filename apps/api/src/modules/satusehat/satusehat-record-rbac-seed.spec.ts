import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Who may compare an encounter's local record with what SATUSEHAT holds
 * (P21-T04).
 *
 * The comparison shows clinical content — diagnoses, vital signs, procedures,
 * medications — so under D-033 it belongs to the treating clinician alone. It
 * has its own OWN-scoped key rather than riding on `encounter.read`, because
 * `ADMIN` holds `encounter.read:any` and reusing that would hand this view to
 * the front desk.
 *
 * Reads the seed file directly rather than the database: CI runs
 * `migrate deploy` without seeding, so no integration spec can observe these
 * rows.
 */
describe('SATUSEHAT record comparison RBAC seed', () => {
  const OWN_KEY = 'satusehat.record.read:own';
  const ANY_KEY = 'satusehat.record.read:any';

  const NON_CLINICIAN_ROLES = ['ADMIN', 'PHARMACIST', 'LAB_TECHNICIAN', 'PATIENT'] as const;

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

  it('defines the own-scope comparison key on its own subject', () => {
    const actualRow = findPermissionRow(OWN_KEY);

    expect(actualRow).toBeDefined();
    expect(actualRow).toContain("'SatusehatRecord'");
    expect(actualRow).toContain("'read'");
    expect(actualRow).toContain("'OWN'");
  });

  it('grants DOCTOR the own-scope key', () => {
    expect(hasBinding('DOCTOR', OWN_KEY)).toBe(true);
  });

  /**
   * An any-scope variant would let one doctor read what SATUSEHAT holds for a
   * colleague's patients — the need-to-know line D-033 draws.
   */
  it('defines no any-scope variant at all', () => {
    expect(findPermissionRow(ANY_KEY)).toBeUndefined();
  });

  it.each(NON_CLINICIAN_ROLES)('grants %s no comparison key', (roleCode) => {
    expect(hasBinding(roleCode, OWN_KEY)).toBe(false);
    expect(hasBinding(roleCode, ANY_KEY)).toBe(false);
  });
});
