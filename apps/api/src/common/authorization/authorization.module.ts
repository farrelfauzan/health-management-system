import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthModule } from '../../modules/auth/auth.module';
import { AbilityFactory } from './ability.factory';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  imports: [AuthModule],
  providers: [
    AbilityFactory,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AbilityFactory],
})
export class AuthorizationModule {}
