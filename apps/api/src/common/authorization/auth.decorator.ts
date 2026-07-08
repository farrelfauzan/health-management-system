import { applyDecorators } from '@nestjs/common';

import { CheckPermissions } from './check-permissions.decorator';
import { PermissionRule } from './permission-rule.type';
import { PublicRoute } from './public-route.decorator';

export function Auth(
  rules: PermissionRule[] = [],
  options?: Partial<{ public: boolean }>,
): MethodDecorator {
  const isPublicRoute = options?.public ?? false;

  return applyDecorators(CheckPermissions(...rules), PublicRoute(isPublicRoute));
}
