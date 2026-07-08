import { SetMetadata } from '@nestjs/common';

import { PermissionRule } from './permission-rule.type';

export const PERMISSION_CHECKER_KEY = 'permission_checker_params_key';

export function CheckPermissions(...rules: PermissionRule[]) {
  return SetMetadata(PERMISSION_CHECKER_KEY, rules);
}
