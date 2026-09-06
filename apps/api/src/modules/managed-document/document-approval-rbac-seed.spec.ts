import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The `P16-T29` grant exists only in `prisma/seed.sql`, and CI runs `migrate
 * deploy` without ever seeding — so no integration spec can observe it. This
 * reads the seed file instead, because the one thing that must never happen
 * quietly is `document-approval.decide:any` folding back into the write
 * grant: the separation between authoring a document and signing it off is
 * the control the whole approval feature exists to provide (§7.5.9).
 */
describe('Document approval RBAC seed', () => {
  const DECIDE_PERMISSION_KEY = 'document-approval.decide:any';
  const REGISTRY_WRITE_PERMISSION_KEY = 'managed-document.write:any';

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

  it('defines the decide permission against its own subject in ANY scope', () => {
    const actualRow = findPermissionRow(DECIDE_PERMISSION_KEY);

    expect(actualRow).toBeDefined();
    // The resource is what AbilityFactory turns into a CASL subject. A row
    // naming `ManagedDocument` here would make the decide key indistinguishable
    // from the write key at the guard, which is exactly the collapse §7.5.9
    // forbids.
    expect(actualRow).toContain(`'DocumentApproval'`);
    expect(actualRow).toContain(`'decide'`);
    expect(actualRow).toContain(`'ANY'`);
  });

  it('keeps the decide key separate from the registry write key', () => {
    const decideRow = findPermissionRow(DECIDE_PERMISSION_KEY);
    const writeRow = findPermissionRow(REGISTRY_WRITE_PERMISSION_KEY);

    expect(decideRow).toBeDefined();
    expect(writeRow).toBeDefined();
    expect(decideRow).not.toEqual(writeRow);
  });

  it('binds the decide key to ADMIN alone and seeds no approver role', () => {
    // OQ-1: no role ships for the documents module. ADMIN holds the key as the
    // back-office default; a clinic composes a narrower approver role from it.
    expect(hasBinding('ADMIN', DECIDE_PERMISSION_KEY)).toBe(true);
    for (const roleCode of ['DOCTOR', 'PHARMACIST', 'PATIENT']) {
      expect(hasBinding(roleCode, DECIDE_PERMISSION_KEY)).toBe(false);
    }
  });

  it('never grants the decide key to a patient role under any spelling', () => {
    // FR-E5-09: a patient is not a candidate approver at all. The service
    // refuses one on the panel; this refuses one holding the key.
    const patientBindings = seedSql
      .split('\n')
      .filter((line) => line.includes(DECIDE_PERMISSION_KEY))
      .filter((line) => /PATIENT/.test(line));

    expect(patientBindings).toEqual([]);
  });
});
