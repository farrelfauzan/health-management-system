import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P16-T02 grants exist only as rows in `prisma/seed.sql`, and CI runs
 * `migrate deploy` without ever seeding — so no integration spec can observe
 * them. This reads the seed file instead: it is the artifact that ships, and
 * a clinic-profile permission silently dropped from it is a letterhead nobody
 * can configure on the next fresh database.
 *
 * The scope is narrow on purpose: these two permissions and their bindings,
 * not the whole matrix, so unrelated permission work never has to edit an
 * expectation here.
 */
describe('Clinic profile RBAC seed', () => {
  const CLINIC_PROFILE_PERMISSION_KEYS = [
    'clinic-profile.read:any',
    'clinic-profile.write:any',
  ] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['ADMIN', ['clinic-profile.read:any', 'clinic-profile.write:any']],
    ['DOCTOR', ['clinic-profile.read:any']],
    ['PHARMACIST', ['clinic-profile.read:any']],
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

  it.each(CLINIC_PROFILE_PERMISSION_KEYS)(
    'defines %s in the permission catalog',
    (permissionKey) => {
      const actualRow = findPermissionRow(permissionKey);

      expect(actualRow).toBeDefined();
      // Resource is what AbilityFactory turns into a CASL subject and scope
      // is what decides whether the guard demands ownership, so a typo in
      // either silently changes who the permission lets through.
      expect(actualRow).toContain(`'ClinicProfile'`);
      expect(actualRow).toContain(`'ANY'`);
    },
  );

  it.each(EXPECTED_BINDINGS)(
    'grants %s exactly its clinic-profile permissions',
    (roleCode, granted) => {
      const actualGranted = CLINIC_PROFILE_PERMISSION_KEYS.filter((permissionKey) =>
        hasBinding(roleCode, permissionKey),
      );

      expect(actualGranted.sort()).toEqual([...granted].sort());
    },
  );

  it('never grants write to a clinical role', () => {
    // The clinic's registered name and licence number are what a printed
    // document asserts about the facility. Reading them is every printer's
    // business; changing them is the administrator's, and a doctor who could
    // would be able to reissue every future document under a different
    // identity without anyone reviewing it.
    const writeHolders = ['DOCTOR', 'PHARMACIST', 'PATIENT'].filter((roleCode) =>
      hasBinding(roleCode, 'clinic-profile.write:any'),
    );

    expect(writeHolders).toEqual([]);
  });
});
