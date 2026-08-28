import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The SJ-1 grants exist only as rows in `prisma/seed.sql`, and CI runs
 * `migrate deploy` without ever seeding — so no integration spec can observe
 * them. This reads the seed file instead: it is the artifact that ships, and a
 * structure permission silently dropped from it is an org chart nobody can edit
 * on the next fresh database.
 *
 * The scope is narrow on purpose — the three organization keys and their
 * bindings, not the whole matrix — so unrelated permission work never has to
 * edit an expectation here.
 */
describe('Organization structure RBAC seed', () => {
  const PERMISSION_KEYS = [
    'organization.structure.read:any',
    'organization.structure.manage:any',
    'organization.member.manage:any',
  ] as const;

  const RESOURCE_BY_KEY: Readonly<Record<string, string>> = {
    'organization.structure.read:any': 'OrganizationUnit',
    'organization.structure.manage:any': 'OrganizationUnit',
    'organization.member.manage:any': 'OrganizationUnitMember',
  };

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['ADMIN', [...PERMISSION_KEYS]],
    ['DOCTOR', []],
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

  it.each(PERMISSION_KEYS)('defines %s in the permission catalog', (permissionKey) => {
    const actualRow = findPermissionRow(permissionKey);

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject and scope is
    // what decides whether the guard demands ownership, so a typo in either
    // silently changes who the permission lets through.
    expect(actualRow).toContain(`'${RESOURCE_BY_KEY[permissionKey]}'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it.each(EXPECTED_BINDINGS)('grants %s exactly its organization permissions', (roleCode, granted) => {
    const actualGranted = PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding(roleCode, permissionKey),
    );

    expect([...actualGranted].sort()).toEqual([...granted].sort());
  });

  it('keeps reading the chart separable from redrawing it', () => {
    // The admin screen renders a read-only tree for anyone holding read alone,
    // and that is the whole reason the two keys are not one `manage`. Collapsing
    // them would make "may see the org chart" imply "may reorganise the clinic".
    expect(findPermissionRow('organization.structure.read:any')).toBeDefined();
    expect(findPermissionRow('organization.structure.manage:any')).toBeDefined();
  });

  it('keeps structure separable from membership', () => {
    // Maintaining the boxes and deciding which box an employee sits in are two
    // jobs, and the platforms this was modelled on separate them. One combined
    // key would hand every office manager the headcount.
    expect(RESOURCE_BY_KEY['organization.structure.manage:any']).not.toBe(
      RESOURCE_BY_KEY['organization.member.manage:any'],
    );
    expect(findPermissionRow('organization.member.manage:any')).toContain(
      `'OrganizationUnitMember'`,
    );
  });

  it('resolves to the intended subject under the last-dot split', () => {
    // `permissionToRule` and `packPermissionHint` both split on the *last* dot,
    // so these keys carry resource `organization.structure` / `organization.member`
    // — the same two-segment shape as `doctor.schedule.write:any`. A key that
    // instead read `organization.structure-manage:any` would resolve to the
    // resource `organization` and quietly merge the two grants.
    for (const permissionKey of PERMISSION_KEYS) {
      const scopeless = permissionKey.replace(/:(any|own)$/, '');
      const separatorIndex = scopeless.lastIndexOf('.');
      const resource = scopeless.slice(0, separatorIndex);

      expect(['organization.structure', 'organization.member']).toContain(resource);
    }
  });

  it('never grants a clinical role the org chart', () => {
    // Nothing clinical hangs off the chart, so a grant here would widen a
    // clinician's reach into back-office structure for no workflow that needs it.
    for (const permissionKey of PERMISSION_KEYS) {
      expect(hasBinding('DOCTOR', permissionKey)).toBe(false);
      expect(hasBinding('PATIENT', permissionKey)).toBe(false);
    }
  });
});
