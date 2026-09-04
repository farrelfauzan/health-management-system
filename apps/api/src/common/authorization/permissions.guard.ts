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

    const request = context
      .switchToHttp()
      .getRequest<{ user?: CurrentUser; auditActorRoles?: string[] }>();
    const currentUser = request.user;

    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const user = await this.authRepository.findUserById(currentUser.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Hand the roles this guard resolved to `AuditInterceptor` (SJ-4). The
    // audit row must name the role the actor acted *as*, and the JWT claim is
    // the wrong source: it is a snapshot from login that a since-revoked role
    // would still list. These are the grants that actually admitted the
    // request, already loaded, so recording them costs no extra query.
    request.auditActorRoles = user.roles.map((userRole) => userRole.role.code);

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

    // Offboarding (P16-T41, §7.3.10.3). A person in their export-only window
    // gets the hard-coded reduced set and nothing from their roles — decided
    // here, from the row this guard just loaded, so it takes effect on the
    // next request rather than the next token refresh. It sits *after* the
    // SUPER_ADMIN unshift on purpose: an offboarded super admin is offboarded.
    const ability = user.offboardedAt
      ? this.abilityFactory.createForOffboardedUser()
      : this.abilityFactory.createForPermissions(permissions);

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
