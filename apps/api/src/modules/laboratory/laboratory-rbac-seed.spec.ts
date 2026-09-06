import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * CI runs `migrate deploy` without ever seeding, so no integration spec can
 * observe these rows. This reads the seed file, which is the artefact that
 * ships (`P18-T01`).
 *
 * The assertion that matters most is the last one: `LAB_TECHNICIAN` is a new
 * clinical-adjacent role, and the promise made when it was added is that an
 * analis reaches the bench and nothing else. A future ticket that hands it
 * `encounter.read:any` to make one screen easier fails here.
 */
describe('Laboratory RBAC seed', () => {
  const LAB_PERMISSION_KEYS = ['lab-test.read:any', 'lab-test.write:any'] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['ADMIN', ['lab-test.read:any', 'lab-test.write:any']],
    // Read only: a doctor orders from the catalog and needs to know what a
    // test measures. What the clinic offers is not their decision.
    ['DOCTOR', ['lab-test.read:any']],
    // Read only for the same reason, from the other side of the bench.
    ['LAB_TECHNICIAN', ['lab-test.read:any']],
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

  it.each(LAB_PERMISSION_KEYS)('defines %s in the permission catalog', (permissionKey) => {
    const actualRow = findPermissionRow(permissionKey);

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject and scope is
    // what the guard re-resolves, so a typo in either silently changes who can
    // edit the catalog.
    expect(actualRow).toContain(`'LabTest'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it('defines the LAB_TECHNICIAN role', () => {
    expect(seedSql).toContain(`('LAB_TECHNICIAN', 'Lab Technician'`);
  });

  it('gives LAB_TECHNICIAN the admin shell, the way PHARMACIST has it', () => {
    expect(hasBinding('LAB_TECHNICIAN', 'portal.admin-access:any')).toBe(true);
  });

  it.each(EXPECTED_BINDINGS)('grants %s exactly its lab permissions', (roleCode, granted) => {
    const actualGranted = LAB_PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding(roleCode, permissionKey),
    );

    expect(actualGranted.sort()).toEqual([...granted].sort());
  });

  it('never gives LAB_TECHNICIAN a clinical :any key beyond the lab ones', () => {
    // The promise the role was added under. A future ticket that hands the
    // analis `encounter.read:any` or `patient.read:any` to make one screen
    // easier fails here rather than in a privacy review.
    const forbiddenClinicalKeys = [
      'encounter.read:any',
      'encounter.write:any',
      'patient.read:any',
      'patient.read-identifier:any',
      'prescription.read:any',
      'patient-document.read:any',
      'invoice.read:any',
    ];
    const wronglyGranted = forbiddenClinicalKeys.filter((permissionKey) =>
      hasBinding('LAB_TECHNICIAN', permissionKey),
    );

    expect(wronglyGranted).toEqual([]);
  });
});
