import {
  applyDecorators,
  Param,
  ParseUUIDPipe,
  type PipeTransform,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { type Type } from '@nestjs/common/interfaces';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AuthGuard } from '../guard/auth.guard';
import { PermissionsGuard } from '../guard/permission.guard';
import { AuthUserInterceptor } from '../interceptors/auth-user.interceptor';
import { type IAbility } from '../interfaces';
import { CheckPermissions } from './permission.decorator';
import { PublicRoute } from './public-route.decorator';

export function Auth(
  permissions: IAbility[] = [],
  options?: Partial<{ public: boolean }>
): MethodDecorator {
  const isPublicRoute = options?.public ?? false;

  return applyDecorators(
    UseGuards(AuthGuard({ public: isPublicRoute }), PermissionsGuard),
    CheckPermissions(...permissions),
    ApiBearerAuth(),
    UseInterceptors(AuthUserInterceptor),
    ApiUnauthorizedResponse({
      description: 'Unauthorized',
    }),
    PublicRoute(isPublicRoute)
  );
}

export function UUIDParam(
  property: string,
  ...pipes: Array<Type<PipeTransform> | PipeTransform>
): ParameterDecorator {
  return Param(property, new ParseUUIDPipe({ version: '4' }), ...pipes);
}
