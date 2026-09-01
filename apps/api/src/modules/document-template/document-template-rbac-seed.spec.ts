import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The `P16-T04`/`P16-T05` grants exist only as rows in `prisma/seed.sql`, and
 * CI runs `migrate deploy` without ever seeding — so no integration spec can
 * observe them. This reads the seed file instead: it is the artifact that
 * ships, and a permission silently dropped from it is a template editor
 * nobody can open on the next fresh database.
 */
describe('Document template RBAC seed', () => {
  const READ_PERMISSION_KEY = 'document-template.read:any';
  const WRITE_PERMISSION_KEY = 'document-template.write:any';

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

  it('defines the read permission against the DocumentTemplate subject', () => {
    const actualRow = findPermissionRow(READ_PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject and scope is
    // what decides whether the guard demands ownership, so a typo in either
    // silently changes who the permission lets through.
    expect(actualRow).toContain(`'DocumentTemplate'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it('grants it to ADMIN alone', () => {
    expect(hasBinding('ADMIN', READ_PERMISSION_KEY)).toBe(true);
    for (const roleCode of ['DOCTOR', 'PHARMACIST', 'PATIENT']) {
      expect(hasBinding(roleCode, READ_PERMISSION_KEY)).toBe(false);
    }
  });

  it('defines the write permission against the DocumentTemplate subject', () => {
    const actualRow = findPermissionRow(WRITE_PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    expect(actualRow).toContain(`'DocumentTemplate'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it('grants the write permission to ADMIN alone', () => {
    // A template decides what every printed invoice says about the clinic —
    // editing one is custody of the clinic's paperwork, not a clinical act.
    expect(hasBinding('ADMIN', WRITE_PERMISSION_KEY)).toBe(true);
    for (const roleCode of ['DOCTOR', 'PHARMACIST', 'PATIENT']) {
      expect(hasBinding(roleCode, WRITE_PERMISSION_KEY)).toBe(false);
    }
  });
});
