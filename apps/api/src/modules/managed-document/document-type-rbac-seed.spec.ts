import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SYSTEM_DOCUMENT_TYPE_CODES } from '@hms/shared-types';

/**
 * The `P16-T39` grants and the nine system type rows exist only in
 * `prisma/seed.sql`, and CI runs `migrate deploy` without ever seeding — so
 * no integration spec can observe them. This reads the seed file instead: it
 * is the artifact that ships, and a permission or a system type silently
 * dropped from it is a settings screen nobody can open, or a handler with no
 * row to bind to, on the next fresh database.
 */
describe('Document type RBAC seed', () => {
  const WRITE_PERMISSION_KEY = 'document-type.write:any';
  const READ_PERMISSION_KEY = 'managed-document.read:any';

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

  it('defines the write permission against the DocumentType subject', () => {
    const actualRow = findPermissionRow(WRITE_PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject and scope is
    // what decides whether the guard demands ownership.
    expect(actualRow).toContain(`'DocumentType'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it('defines the registry read permission against the ManagedDocument subject', () => {
    const actualRow = findPermissionRow(READ_PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    expect(actualRow).toContain(`'ManagedDocument'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it('binds both keys to ADMIN alone, and seeds no role for the documents module', () => {
    // §7.5.9 / OQ-1: the keys ship so they can be assigned; the clinic
    // composes narrower roles. ADMIN holds them as back-office custody beside
    // the template pair. A clinical or patient role acquiring either would
    // be a widening this spec exists to catch.
    for (const permissionKey of [WRITE_PERMISSION_KEY, READ_PERMISSION_KEY]) {
      expect(hasBinding('ADMIN', permissionKey)).toBe(true);
      for (const roleCode of ['DOCTOR', 'PHARMACIST', 'PATIENT']) {
        expect(hasBinding(roleCode, permissionKey)).toBe(false);
      }
    }
    expect(seedSql).not.toMatch(/'DOCUMENT_(ADMIN|MANAGER|APPROVER)'/);
  });

  it.each(SYSTEM_DOCUMENT_TYPE_CODES)('seeds the %s system type', (code) => {
    const row = seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${code}',`));

    expect(row).toBeDefined();
  });

  it('binds behaviour to exactly the three system types that have code behind them', () => {
    expect(seedSql).toMatch(/\('INVOICE_TEMPLATE',[^\n]*'INVOICE_TEMPLATE', FALSE/);
    expect(seedSql).toMatch(/\('CLINIC_CORPUS_DOCUMENT',[^\n]*'CLINIC_CORPUS', TRUE/);
    expect(seedSql).toMatch(/\('PATIENT_BILL',[^\n]*'PATIENT_BILL', FALSE/);
    // Every other seeded type is GENERIC: a clinic may rename or re-policy
    // it, and nothing happens on issue that a clinic type could not do.
    const genericCodes = SYSTEM_DOCUMENT_TYPE_CODES.filter(
      (code) => !['INVOICE_TEMPLATE', 'CLINIC_CORPUS_DOCUMENT', 'PATIENT_BILL'].includes(code),
    );
    for (const code of genericCodes) {
      expect(seedSql).toMatch(new RegExp(`\\('${code}',[^\\n]*'GENERIC',`));
    }
  });

  it('lets the seed own only code, behaviour and the system flag on re-run', () => {
    // The clinic owns the name and the approval policy (FR-E5-33); a `DO
    // UPDATE` that touched them would undo a clinic's choice on every deploy.
    const upsert = seedSql.slice(seedSql.indexOf('INSERT INTO "document_types"'));
    const doUpdate = upsert.slice(upsert.indexOf('ON CONFLICT ("code") DO UPDATE'));
    const setClause = doUpdate.slice(0, doUpdate.indexOf(';'));

    expect(setClause).toContain('"behavior" = EXCLUDED."behavior"');
    expect(setClause).toContain('"is_system" = TRUE');
    expect(setClause).not.toContain('"name"');
    expect(setClause).not.toContain('"is_approval_required"');
    expect(setClause).not.toContain('"allow_self_approval"');
  });
});
