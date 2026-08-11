import { ForbiddenError } from '@casl/ability';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthRepository } from '../../modules/auth/repository/auth.repository';
import { CurrentUser } from '../auth/current-user.type';
import { AbilityFactory } from './ability.factory';
import { PERMISSION_CHECKER_KEY } from './check-permissions.decorator';
import { PermissionRule } from './permission-rule.type';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authRepository: AuthRepository,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublicRoute) {
      return true;
    }

    const requiredRules = this.reflector.getAllAndOverride<PermissionRule[] | undefined>(
      PERMISSION_CHECKER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRules === undefined || requiredRules.length === 0) {
      throw new ForbiddenException(
        'Route declares no permission requirements and is not public; access is denied by default',
      );
    }

    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>();
    const currentUser = request.user;

    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const user = await this.authRepository.findUserById(currentUser.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const permissions = user.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => ({
        action: rolePermission.permission.action,
        resource: rolePermission.permission.resource,
        scope: rolePermission.permission.scope,
      })),
    );

    const hasSuperAdminRole = user.roles.some((userRole) => userRole.role.code === 'SUPER_ADMIN');

    if (hasSuperAdminRole) {
      permissions.unshift({ action: 'manage', resource: 'all', scope: 'ANY' as const });
    }

    const ability = this.abilityFactory.createForPermissions(permissions);

    try {
      for (const rule of requiredRules) {
        ForbiddenError.from(ability)
          .setMessage('You are not allowed to perform this action')
          .throwUnlessCan(rule.action, rule.subject);
      }
      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      throw new InternalServerErrorException('Authorization guard failed unexpectedly');
    }
  }
}
