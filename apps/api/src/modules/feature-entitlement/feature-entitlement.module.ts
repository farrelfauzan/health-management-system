import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { FeatureAdminController } from './controller/feature-admin.controller';
import { FeatureAvailabilityController } from './controller/feature-availability.controller';
import { FeatureEntitlementRepository } from './repository/feature-entitlement.repository';
import { FeatureEntitlementService } from './service/feature-entitlement.service';

@Module({
  imports: [PrismaModule],
  controllers: [FeatureAdminController, FeatureAvailabilityController],
  providers: [FeatureEntitlementRepository, FeatureEntitlementService],
  exports: [FeatureEntitlementService],
})
export class FeatureEntitlementModule {}
