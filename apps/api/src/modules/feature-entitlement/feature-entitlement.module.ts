import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { FeatureAdminController } from './controller/feature-admin.controller';
import { FeatureAvailabilityController } from './controller/feature-availability.controller';
import { FeatureEntitlementRepository } from './repository/feature-entitlement.repository';
import { FeatureAvailabilityCacheService } from './service/feature-availability-cache.service';
import { FeatureEntitlementService } from './service/feature-entitlement.service';

/**
 * `@Global()` because `FeatureAvailabilityCacheService` is consumed by
 * `FeatureGuard`, which is an `APP_GUARD` and therefore runs in front of every
 * controller in the application — the same reason `PrismaModule`,
 * `AuditModule` and `AuthorizationModule` are global. Having
 * `AuthorizationModule` import this module instead would work, but it would
 * hoist these controllers ahead of every other one in the module graph and
 * reshuffle the whole generated OpenAPI document for no behavioural gain.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [FeatureAdminController, FeatureAvailabilityController],
  providers: [FeatureEntitlementRepository, FeatureAvailabilityCacheService, FeatureEntitlementService],
  exports: [FeatureEntitlementService, FeatureAvailabilityCacheService],
})
export class FeatureEntitlementModule {}
