import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability';
import { Injectable } from '@nestjs/common';

type AppAbilities = [string, string];
export type AppAbility = MongoAbility<AppAbilities>;

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
      conditions: permission.scope === 'OWN' ? { ownerId: '__current_user__' } : undefined,
    }));

    return createMongoAbility<AppAbility>(rules);
  }
}
