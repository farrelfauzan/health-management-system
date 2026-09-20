import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P27-T02 grants exist only as rows in `prisma/seed.sql`, which CI never
 * runs, so this reads the seed file itself. Narrow on purpose: the two
 * tax-settings keys and their bindings, nothing else.
 */
describe('Tax settings RBAC seed', () => {
  const TAX_SETTINGS_PERMISSION_KEYS = ['tax-settings.read:any', 'tax-settings.write:any'] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['ADMIN', ['tax-settings.read:any', 'tax-settings.write:any']],
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

  it.each(TAX_SETTINGS_PERMISSION_KEYS)(
    'defines %s on the TaxSettings subject',
    (permissionKey) => {
      const actualRow = findPermissionRow(permissionKey);

      expect(actualRow).toContain(`'TaxSettings'`);
      expect(actualRow).toContain(`'ANY'`);
    },
  );

  it.each(EXPECTED_BINDINGS)(
    'grants %s exactly its tax-settings permissions',
    (roleCode, granted) => {
      const actualGranted = TAX_SETTINGS_PERMISSION_KEYS.filter((permissionKey) =>
        hasBinding(roleCode, permissionKey),
      );

      expect(actualGranted).toEqual([...granted]);
    },
  );

  it.each(['tax-code.read:any', 'tax-code.write:any'])(
    'defines %s on the TaxCode subject for ADMIN only',
    (permissionKey) => {
      expect(findPermissionRow(permissionKey)).toContain(`'TaxCode'`);
      expect(hasBinding('ADMIN', permissionKey)).toBe(true);
      expect(
        ['DOCTOR', 'MIDWIFE', 'PHARMACIST', 'PATIENT'].filter((role) =>
          hasBinding(role, permissionKey),
        ),
      ).toEqual([]);
    },
  );

  it.each(['tax-report.read:any', 'tax-report.write:any'])(
    'defines %s on the TaxReport subject for ADMIN only (P27-T05)',
    (permissionKey) => {
      expect(findPermissionRow(permissionKey)).toContain(`'TaxReport'`);
      expect(hasBinding('ADMIN', permissionKey)).toBe(true);
      expect(
        ['DOCTOR', 'MIDWIFE', 'PHARMACIST', 'PATIENT'].filter((role) =>
          hasBinding(role, permissionKey),
        ),
      ).toEqual([]);
    },
  );

  it('seeds the system tax codes and a default for every target (P27-T03)', () => {
    ['JASA-MEDIS', 'BARANG-PPN', 'JASA-NONMEDIS-PPN', 'BEBAS-PROGRAM', 'NON-OBJEK'].forEach(
      (code) => expect(seedSql).toContain(`('${code}', '`),
    );
    ['CONSULTATION', 'PROCEDURE', 'ACCOMMODATION', 'LAB', 'OTHER', 'MEDICATION'].forEach((target) =>
      expect(seedSql).toMatch(new RegExp(`\\('${target}', '(JASA-MEDIS|BARANG-PPN)'\\)`)),
    );
  });

  it('seeds the taxes entitlement on', () => {
    expect(seedSql).toContain(`('taxes', TRUE)`);
  });
});
