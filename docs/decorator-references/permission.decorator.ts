import { type CustomDecorator, SetMetadata } from '@nestjs/common';

import { type IAbility } from '../interfaces';

export const PERMISSION_CHECKER_KEY = 'permission_checker_params_key';

// export type RequiredPermission = [ACLType, ModulesType];
export function CheckPermissions(
  ...parameters: IAbility[]
): CustomDecorator<string> {
  return SetMetadata(PERMISSION_CHECKER_KEY, parameters);
}
