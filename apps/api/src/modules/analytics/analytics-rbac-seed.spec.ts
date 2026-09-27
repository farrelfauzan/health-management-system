import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P29-T01 grants exist only as rows in `prisma/seed.sql`, which CI never
 * runs, so this reads the seed file itself. Narrow on purpose: the seven
 * analytics keys, their bindings and the SUPER_ADMIN exclusions.
 */
describe('Analytics RBAC seed', () => {
  const ANALYTICS_PERMISSION_KEYS = [
    'analytics.read-operations:any',
    'analytics.read-finance:any',
    'analytics.read-clinical:any',
    'analytics.read-pharmacy:any',
    'analytics.read-lab:any',
    'analytics.read-practice:own',
    'analytics.export:any',
  ] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      'ADMIN',
      [
        'analytics.read-operations:any',
        'analytics.read-finance:any',
        'analytics.read-clinical:any',
        'analytics.read-pharmacy:any',
        'analytics.read-lab:any',
        'analytics.export:any',
      ],
    ],
    ['DOCTOR', ['analytics.read-practice:own']],
    ['MIDWIFE', ['analytics.read-practice:own']],
    ['PHARMACIST', ['analytics.read-pharmacy:any']],
    ['LAB_TECHNICIAN', ['analytics.read-lab:any']],
    ['PATIENT', []],
  ];

  const SUPER_ADMIN_WITHHELD_KEYS = [
    'analytics.read-clinical:any',
    'analytics.read-practice:own',
    'analytics.export:any',
  ] as const;

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

  function readSuperAdminWithheldKeys(): string {
    const start = seedSql.indexOf('super_admin_withheld_keys(permission_key) AS (');
    const end = seedSql.indexOf('\n),', start);
    return seedSql.slice(start, end);
  }

  it.each(ANALYTICS_PERMISSION_KEYS)('defines %s on the Analytics subject', (permissionKey) => {
    const actualRow = findPermissionRow(permissionKey);
    const expectedScope = permissionKey.endsWith(':own') ? `'OWN'` : `'ANY'`;

    expect(actualRow).toContain(`'Analytics'`);
    expect(actualRow).toContain(expectedScope);
  });

  it.each(EXPECTED_BINDINGS)('grants %s exactly its analytics permissions', (roleCode, granted) => {
    const actualGranted = ANALYTICS_PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding(roleCode, permissionKey),
    );

    expect(actualGranted).toEqual([...granted]);
  });

  it('keeps case mix, own practice and export out of the SUPER_ADMIN union', () => {
    const withheld = readSuperAdminWithheldKeys();

    SUPER_ADMIN_WITHHELD_KEYS.forEach((permissionKey) =>
      expect(withheld).toContain(`('${permissionKey}')`),
    );
    expect(seedSql).toMatch(/NOT IN \(\s*SELECT "permission_key"\s*FROM super_admin_withheld_keys/);
  });

  it('leaves the operations, finance, pharmacy and lab dashboards to SUPER_ADMIN', () => {
    const withheld = readSuperAdminWithheldKeys();

    [
      'analytics.read-operations:any',
      'analytics.read-finance:any',
      'analytics.read-pharmacy:any',
      'analytics.read-lab:any',
    ].forEach((permissionKey) => expect(withheld).not.toContain(permissionKey));
  });

  it('seeds the analytics entitlement on', () => {
    expect(seedSql).toContain(`('analytics', TRUE)`);
  });
});
