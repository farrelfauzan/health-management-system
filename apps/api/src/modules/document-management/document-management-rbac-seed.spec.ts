import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P15-T10 grants exist only as rows in `prisma/seed.sql`, and CI runs
 * `migrate deploy` without ever seeding — so no integration spec can observe
 * them. This reads the seed file instead: it is the artifact that ships, and
 * a document permission silently dropped from it is a corpus nobody can
 * manage on the next fresh database.
 *
 * The scope is narrow on purpose: the document catalogue and its bindings,
 * not the whole matrix, so unrelated permission work never has to edit an
 * expectation here.
 */
describe('Document management RBAC seed', () => {
  const DOCUMENT_PERMISSION_KEYS = [
    'document.read:any',
    'document.write:any',
    'document.read:own',
    'document.write:own',
  ] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      'ADMIN',
      ['document.read:any', 'document.write:any', 'document.read:own', 'document.write:own'],
    ],
    ['DOCTOR', ['document.read:own', 'document.write:own']],
    ['PATIENT', []],
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

  it.each(DOCUMENT_PERMISSION_KEYS)('defines %s in the permission catalog', (permissionKey) => {
    const actualRow = findPermissionRow(permissionKey);

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject and scope is
    // what decides whether the guard demands ownership, so a typo in either
    // silently changes who the permission lets through.
    expect(actualRow).toContain(`'Document'`);
    expect(actualRow).toContain(permissionKey.endsWith(':any') ? `'ANY'` : `'OWN'`);
  });

  it.each(EXPECTED_BINDINGS)('grants %s exactly its document permissions', (roleCode, granted) => {
    const actualGranted = DOCUMENT_PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding(roleCode, permissionKey),
    );

    expect(actualGranted.sort()).toEqual([...granted].sort());
  });

  it('never grants DOCTOR the ANY scope over documents', () => {
    // A personal knowledge base is private to its owner (ai-chatbot-tools.md
    // §5.5). An ANY grant here would make every clinician's corpus readable
    // by every other clinician, which is the one thing owner scoping exists
    // to prevent — and it would do so silently, since retrieval would simply
    // start returning more.
    expect(hasBinding('DOCTOR', 'document.read:any')).toBe(false);
    expect(hasBinding('DOCTOR', 'document.write:any')).toBe(false);
  });

  it('grants PATIENT nothing over the document store', () => {
    // Patients have no knowledge base in this phase. `PATIENT` exists as an
    // owner type for the future patient-document feature, and a row nobody
    // can create is exactly the intended state until then.
    const actualGranted = DOCUMENT_PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding('PATIENT', permissionKey),
    );

    expect(actualGranted).toEqual([]);
  });
});
