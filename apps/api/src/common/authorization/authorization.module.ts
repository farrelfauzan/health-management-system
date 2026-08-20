import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthModule } from '../../modules/auth/auth.module';
import { AbilityFactory } from './ability.factory';
import { FeatureGuard } from './feature.guard';
import { PermissionsGuard } from './permissions.guard';

/**
 * Guard order is load-bearing, and Nest runs `APP_GUARD` providers in
 * declaration order: `JwtAuthGuard` -> `PermissionsGuard` -> `FeatureGuard`.
 *
 * `FeatureGuard` is last so a caller without the role grant is refused before
 * the entitlement is ever consulted (IMP-8). Reversing the two would answer
 * `FEATURE_DISABLED` to someone who was never allowed to call the route,
 * telling any signed-in user which modules this clinic bought.
 *
 * Its entitlement cache arrives from the global `FeatureEntitlementModule`
 * rather than an import here, so this module stays at the front of the graph.
 */
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
    {
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
  ],
  exports: [AbilityFactory],
})
export class AuthorizationModule {}
