import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The guard test this ticket exists for (`P16-T17`, FR-E3-03).
 *
 * Every other RBAC seed spec in this repo asserts that the right roles hold
 * the right keys. This one asserts something stronger and stranger: that two
 * particular keys **do not exist in the catalog at all**. Not "no role holds
 * `vault-document.read:any`" — there is no such permission row for anyone to
 * be granted, now or by a future administrator clicking through a role
 * screen.
 *
 * That distinction is the whole design. A vault holds a doctor's KTP, their
 * contracts, their licences; the promise is that nobody else can read it, and
 * a promise kept by "we did not grant that permission to anyone" is one role
 * edit away from being broken quietly. A promise kept by "the permission is
 * not a thing that exists" is not.
 *
 * The P16-T08 spec beside this one reads the seed file for the same reason:
 * CI runs `migrate deploy` without ever seeding, so no integration spec can
 * observe these rows.
 */
describe('Vault document RBAC seed', () => {
  const VAULT_DOCUMENT_PERMISSION_KEYS = [
    'vault-document.read:own',
    'vault-document.write:own',
  ] as const;

  const FORBIDDEN_ANY_KEYS = [
    'vault-document.read:any',
    'vault-document.write:any',
    'vault-document.delete:any',
    'vault-document.share:any',
  ] as const;

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['ADMIN', ['vault-document.read:own', 'vault-document.write:own']],
    ['DOCTOR', ['vault-document.read:own', 'vault-document.write:own']],
    ['PATIENT', []],
    ['PHARMACIST', []],
    ['RECEPTIONIST', []],
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

  it.each(VAULT_DOCUMENT_PERMISSION_KEYS)(
    'defines %s in the permission catalog',
    (permissionKey) => {
      const actualRow = findPermissionRow(permissionKey);

      expect(actualRow).toBeDefined();
      // Resource is what AbilityFactory turns into a CASL subject and scope is
      // what the service re-resolves, so a typo in either silently changes who
      // opens a vault.
      expect(actualRow).toContain(`'VaultDocument'`);
      expect(actualRow).toContain(`'OWN'`);
    },
  );

  it.each(FORBIDDEN_ANY_KEYS)('never defines %s anywhere in the seed', (permissionKey) => {
    // Not "no role holds it" — the key must not exist, so there is nothing to
    // grant later. This is the assertion the ticket is named after.
    expect(seedSql).not.toContain(permissionKey);
  });

  it('defines no vault-document permission at ANY scope, under any verb', () => {
    // The checks above name the verbs we thought of. This one catches the one
    // we did not: any future `vault-document.<verb>:any` row fails here the
    // moment it is added, whatever the verb is called.
    const anyScopedVaultRows = seedSql
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`('vault-document.`) && line.includes(`'ANY'`));

    expect(anyScopedVaultRows).toEqual([]);
  });

  it.each(EXPECTED_BINDINGS)('grants %s exactly its vault permissions', (roleCode, granted) => {
    const actualGranted = VAULT_DOCUMENT_PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding(roleCode, permissionKey),
    );

    expect(actualGranted.sort()).toEqual([...granted].sort());
  });

  it('gives ADMIN a vault of their own and nothing over anyone else’s', () => {
    // An administrator is also a person with a contract and a KTP, so they
    // hold the same OWN keys a doctor does. What makes that safe is not
    // restraint in this file — it is that the ANY keys asserted absent above
    // do not exist for the grant to widen into.
    expect(hasBinding('ADMIN', 'vault-document.read:own')).toBe(true);
    expect(hasBinding('ADMIN', 'vault-document.write:own')).toBe(true);
    expect(seedSql).not.toContain('vault-document.read:any');
  });

  it('never grants a vault permission to a patient', () => {
    // The vault is a practitioner's own paperwork. A patient has no vault in
    // this phase, and no route that would open one.
    expect(hasBinding('PATIENT', 'vault-document.read:own')).toBe(false);
    expect(hasBinding('PATIENT', 'vault-document.write:own')).toBe(false);
  });
});
