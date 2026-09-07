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
  const LAB_PERMISSION_KEYS = [
    'lab-test.read:any',
    'lab-test.write:any',
    'lab-order.read:own',
    'lab-order.read:any',
    'lab-order.write:own',
    'lab-order.write:any',
    'lab-specimen.write:any',
    'lab-result.write:any',
    'lab-result.verify:any',
    'lab-settings.read:any',
    'lab-settings.write:any',
  ] as const;

  /** The CASL subject and scope each key must carry, which the guard re-resolves. */
  const EXPECTED_KEY_SHAPE: Readonly<Record<string, readonly [string, string]>> = {
    'lab-test.read:any': ['LabTest', 'ANY'],
    'lab-test.write:any': ['LabTest', 'ANY'],
    'lab-order.read:own': ['LabOrder', 'OWN'],
    'lab-order.read:any': ['LabOrder', 'ANY'],
    'lab-order.write:own': ['LabOrder', 'OWN'],
    'lab-order.write:any': ['LabOrder', 'ANY'],
    'lab-specimen.write:any': ['LabSpecimen', 'ANY'],
    'lab-result.write:any': ['LabResult', 'ANY'],
    'lab-result.verify:any': ['LabResult', 'ANY'],
    'lab-settings.read:any': ['LaboratorySettings', 'ANY'],
    'lab-settings.write:any': ['LaboratorySettings', 'ANY'],
  };

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      'ADMIN',
      [
        'lab-test.read:any',
        'lab-test.write:any',
        'lab-order.read:any',
        'lab-order.write:any',
        'lab-specimen.write:any',
        'lab-result.write:any',
        'lab-result.verify:any',
        'lab-settings.read:any',
        'lab-settings.write:any',
      ],
    ],
    // Read only on the catalog: a doctor orders from it and needs to know what
    // a test measures. What the clinic offers is not their decision. OWN on the
    // order itself — ordering is the attending practitioner's act (P18-T02).
    // P18-T04. `verify` and no `write`: a doctor signs a result out, and the
    // service refuses them as the second signature on a value they typed
    // themselves unless the clinic runs single-operator. Read on the settings
    // so the release screen can say which rules are in force.
    [
      'DOCTOR',
      [
        'lab-test.read:any',
        'lab-order.read:own',
        'lab-order.write:own',
        'lab-result.verify:any',
        'lab-settings.read:any',
      ],
    ],
    // The bench: reads the catalog and the orders, and handles specimens.
    // Deliberately no write on an order — an analis runs what was asked for and
    // never decides what was asked for.
    [
      'LAB_TECHNICIAN',
      [
        'lab-test.read:any',
        'lab-order.read:any',
        'lab-specimen.write:any',
        'lab-result.write:any',
        // Held, but inert until the clinic turns `technicianMayVerify` on —
        // a seeded grant cannot depend on a runtime row, so the capability is
        // seeded and `LabResultService` enforces the policy (P18-T04).
        'lab-result.verify:any',
        'lab-settings.read:any',
      ],
    ],
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
    const [expectedSubject, expectedScope] = EXPECTED_KEY_SHAPE[permissionKey] ?? [];

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject and scope is
    // what the guard re-resolves, so a typo in either silently changes who can
    // edit the catalog — or, for an order key, whose visits a doctor reaches.
    expect(actualRow).toContain(`'${expectedSubject}'`);
    expect(actualRow).toContain(`'${expectedScope}'`);
  });

  // P18-T03. Collecting is a bench act performed on whoever is in the chair;
  // an `:own` form would imply a version of it scoped to somebody's own
  // records, and there is none.
  it('defines no OWN form of the specimen key', () => {
    expect(findPermissionRow('lab-specimen.write:own')).toBeUndefined();
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

  // P18-T11. Changing where work is filled and who pays for it rides on the
  // ordering key rather than a new one: it is the same decision the order
  // itself records, made a few minutes later at the counter. A separate
  // permission would let a role move money without being able to order.
  // P18-T04. Entering a value and signing it out are two keys, because they
  // are the two halves of a two-person rule. Merging them would let whoever
  // typed a number be its own second signature by construction.
  it('keeps entering a result and verifying one as separate keys', () => {
    expect(findPermissionRow('lab-result.write:any')).toBeDefined();
    expect(findPermissionRow('lab-result.verify:any')).toBeDefined();
    expect(findPermissionRow('lab-result.write:any')).toContain(`'write'`);
    expect(findPermissionRow('lab-result.verify:any')).toContain(`'verify'`);
  });

  // Changing who may sign a result out is an administrative act, never a bench
  // one: the analis reads the rules and cannot rewrite them.
  it('never lets the bench change the rules it is judged by', () => {
    expect(hasBinding('LAB_TECHNICIAN', 'lab-settings.write:any')).toBe(false);
    expect(hasBinding('DOCTOR', 'lab-settings.write:any')).toBe(false);
    expect(hasBinding('ADMIN', 'lab-settings.write:any')).toBe(true);
  });

  it('adds no separate key for changing a disposition', () => {
    expect(findPermissionRow('lab-order.disposition:any')).toBeUndefined();
    expect(findPermissionRow('lab-order.refer:any')).toBeUndefined();
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
