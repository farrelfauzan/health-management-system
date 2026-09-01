import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P16-T08 grants exist only as rows in `prisma/seed.sql`, and CI runs
 * `migrate deploy` without ever seeding — so no integration spec can observe
 * them. This reads the seed file instead, mirroring the P15-T10 spec beside
 * it: the seed is the artifact that ships, and a patient-document permission
 * silently dropped from it is a patient file nobody can open on the next
 * fresh database.
 */
describe('Patient document RBAC seed', () => {
  const PATIENT_DOCUMENT_PERMISSION_KEYS = [
    'patient-document.read:any',
    'patient-document.read:own',
    'patient-document.write:any',
    'patient-document.write:own',
    'patient-document.release:own',
    'patient-document.delete:any',
  ] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      'ADMIN',
      ['patient-document.read:any', 'patient-document.write:any', 'patient-document.delete:any'],
    ],
    [
      'DOCTOR',
      [
        'patient-document.read:own',
        'patient-document.write:own',
        'patient-document.release:own',
      ],
    ],
    ['PATIENT', ['patient-document.read:own']],
    ['PHARMACIST', []],
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

  it.each(PATIENT_DOCUMENT_PERMISSION_KEYS)(
    'defines %s in the permission catalog',
    (permissionKey) => {
      const actualRow = findPermissionRow(permissionKey);

      expect(actualRow).toBeDefined();
      // Resource is what AbilityFactory turns into a CASL subject and scope
      // is what the services re-resolve, so a typo in either silently changes
      // who reaches a patient's file.
      expect(actualRow).toContain(`'PatientDocument'`);
      expect(actualRow).toContain(permissionKey.endsWith(':any') ? `'ANY'` : `'OWN'`);
    },
  );

  it.each(EXPECTED_BINDINGS)(
    'grants %s exactly its patient-document permissions',
    (roleCode, granted) => {
      const actualGranted = PATIENT_DOCUMENT_PERMISSION_KEYS.filter((permissionKey) =>
        hasBinding(roleCode, permissionKey),
      );

      expect(actualGranted.sort()).toEqual([...granted].sort());
    },
  );

  it('never grants DOCTOR any ANY scope over patient documents', () => {
    // A doctor's reach is the assignment/attendance relationship (FR-E2-06),
    // resolved per request in PatientDocumentAccessService. An ANY grant
    // would silently widen every doctor to every patient's file.
    expect(hasBinding('DOCTOR', 'patient-document.read:any')).toBe(false);
    expect(hasBinding('DOCTOR', 'patient-document.write:any')).toBe(false);
    expect(hasBinding('DOCTOR', 'patient-document.delete:any')).toBe(false);
  });

  it('grants no release permission outside DOCTOR', () => {
    // Release is the clinical decision that puts a result in front of the
    // patient (FR-E2-13). ADMIN holding it would make portal visibility a
    // clerical action.
    expect(hasBinding('ADMIN', 'patient-document.release:own')).toBe(false);
    expect(seedSql.includes(`'patient-document.release:any'`)).toBe(false);
  });

  it('grants PATIENT read only', () => {
    // A patient reads their own released files; they never upload, edit,
    // release, or delete through this surface in this phase.
    expect(hasBinding('PATIENT', 'patient-document.write:own')).toBe(false);
    expect(hasBinding('PATIENT', 'patient-document.write:any')).toBe(false);
    expect(hasBinding('PATIENT', 'patient-document.release:own')).toBe(false);
    expect(hasBinding('PATIENT', 'patient-document.delete:any')).toBe(false);
  });
});
