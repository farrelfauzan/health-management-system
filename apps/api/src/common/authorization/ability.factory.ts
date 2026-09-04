import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability';
import { Injectable } from '@nestjs/common';

type AppAbilities = [string, string];
export type AppAbility = MongoAbility<AppAbilities>;

const OWN_SCOPE_CONDITIONS = { ownerId: '__current_user__' } as const;

/**
 * Everything an offboarded person can do (`P16-T41`, FR-E3-23/24): view,
 * download and export their own vault (`read`), and delete from it
 * (`delete`). Nothing else — no patients, encounters, appointments,
 * prescriptions, knowledge base, chat or directory, and no new shares.
 *
 * Hard-coded here on purpose, and it must stay that way. This is the same
 * reasoning that made `vault-document.read:any` a key that does not exist:
 * a seeded role can be edited in the portal and quietly widened, while a code
 * branch can only change in a reviewed diff. The key list this mirrors lives
 * in `OFFBOARDED_PERMISSION_KEYS` for the session claims the web renders
 * from; `ability.factory.spec.ts` holds the two in step.
 */
const OFFBOARDED_RULES: readonly RawRuleOf<AppAbility>[] = [
  { action: 'read', subject: 'VaultDocument', conditions: OWN_SCOPE_CONDITIONS },
  { action: 'delete', subject: 'VaultDocument', conditions: OWN_SCOPE_CONDITIONS },
];

@Injectable()
export class AbilityFactory {
  createForPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): AppAbility {
    const hasManageAll = permissions.some(
      (permission) => permission.action === 'manage' && permission.resource === 'all',
    );

    if (hasManageAll) {
      return createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }]);
    }

    const rules: RawRuleOf<AppAbility>[] = permissions.map((permission) => ({
      action: permission.action,
      subject: permission.resource,
      conditions: permission.scope === 'OWN' ? OWN_SCOPE_CONDITIONS : undefined,
    }));

    return createMongoAbility<AppAbility>(rules);
  }

  /**
   * The reduced ability for a person whose `User.offboardedAt` is set.
   *
   * Takes no permissions on purpose: whatever roles the person still holds —
   * including SUPER_ADMIN's catalog-wide grant — contribute nothing here.
   * The guard chooses this branch before it ever looks at a role.
   */
  createForOffboardedUser(): AppAbility {
    return createMongoAbility<AppAbility>([...OFFBOARDED_RULES]);
  }
}
