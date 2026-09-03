import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AbilityFactory } from '../../common/authorization/ability.factory';

/**
 * US-E3-02 against the ability layer: **an ADMIN holding every permission the
 * seed defines gets no rule that reaches someone else's vault.**
 *
 * A note on what this can and cannot prove. `PermissionsGuard` in this repo is
 * scope-blind by design — a CASL rule carrying an ownership condition still
 * answers "can read VaultDocument" for the subject *type*, because the guard
 * checks subject and action, not instances. Scope is re-resolved per request
 * by the owning service, exactly as `PatientDocumentAccessService` does for
 * clinical files. So this spec asserts on the **rules** the factory produces,
 * not on `ability.can(...)` against a constructed document: a spec written the
 * other way would be asserting a mechanism this codebase does not rely on, and
 * would go green even if the real protection were removed.
 *
 * The permissions are read out of `prisma/seed.sql` rather than listed here on
 * purpose. A hand-written list proves only that the keys the author remembered
 * are harmless; reading the catalog means a future permission that *would*
 * open a vault fails this spec on the day it is added.
 *
 * The three things that actually keep a vault private, and where each is
 * proven: no `:any` key exists to grant (`vault-document-rbac-seed.spec.ts`),
 * every query filters by owner as a predicate
 * (`repository/vault-document.database.spec.ts`), and no route accepts an
 * owner id (`vault-document.integration.spec.ts`).
 */
describe('Vault document abilities', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  type SeededPermission = { action: string; resource: string; scope: 'ANY' | 'OWN' };

  /** Every permission row in the seed catalog, as the factory takes them. */
  function readSeededPermissions(): SeededPermission[] {
    const rowPattern = /^\('[a-z-]+\.[a-z-]+:(?:any|own)', '([A-Za-z]+)', '([a-z-]+)', '(ANY|OWN)'/;
    return seedSql
      .split('\n')
      .map((line) => line.trim())
      .flatMap((line) => {
        const match = rowPattern.exec(line);
        if (match === null) {
          return [];
        }
        return [{ resource: match[1]!, action: match[2]!, scope: match[3]! as 'ANY' | 'OWN' }];
      });
  }

  const abilityFactory = new AbilityFactory();

  it('reads a non-empty permission catalog out of the seed', () => {
    // Guards every assertion below: a regex that silently matched nothing
    // would make the "no ANY rule" checks pass for the wrong reason.
    const permissions = readSeededPermissions();

    expect(permissions.length).toBeGreaterThan(50);
    expect(permissions).toContainEqual({
      action: 'read',
      resource: 'VaultDocument',
      scope: 'OWN',
    });
  });

  it('gives an actor holding every seeded permission only owner-conditioned vault rules', () => {
    const ability = abilityFactory.createForPermissions(readSeededPermissions());

    const vaultRules = ability.rules.filter((rule) => rule.subject === 'VaultDocument');
    expect(vaultRules.length).toBeGreaterThan(0);
    for (const rule of vaultRules) {
      // An unconditioned rule here is an ANY grant by another name: it would
      // match any document of this subject type, whoever owns it.
      expect(rule.conditions).toEqual({ ownerId: '__current_user__' });
    }
  });

  it('gives that actor no vault rule at ANY scope, under any verb', () => {
    const permissions = readSeededPermissions();

    const anyScopedVaultPermissions = permissions.filter(
      (permission) => permission.resource === 'VaultDocument' && permission.scope === 'ANY',
    );

    expect(anyScopedVaultPermissions).toEqual([]);
  });

  it('grants nothing over VaultDocument through another resource’s ANY key', () => {
    // The catalog is full of `:any` keys — patient documents, users, roles.
    // None of them names this subject, so holding all of them reaches no
    // vault rule at all.
    const ability = abilityFactory.createForPermissions(
      readSeededPermissions().filter((permission) => permission.resource !== 'VaultDocument'),
    );

    expect(ability.rules.filter((rule) => rule.subject === 'VaultDocument')).toEqual([]);
  });

  it('would produce an unconditioned rule if an ANY key ever existed', () => {
    // The inverse, so the assertions above are known to be testing something.
    // This is precisely what `vault-document.read:any` would do, and why the
    // seed spec asserts the key is absent from the catalog rather than merely
    // unbound to any role.
    const ability = abilityFactory.createForPermissions([
      { action: 'read', resource: 'VaultDocument', scope: 'ANY' },
    ]);

    expect(ability.rules[0]).toMatchObject({ subject: 'VaultDocument', action: 'read' });
    expect(ability.rules[0]?.conditions).toBeUndefined();
  });
});
