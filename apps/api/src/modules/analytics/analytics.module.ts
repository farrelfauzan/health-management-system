import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AnalyticsOperationsController } from './controller/analytics-operations.controller';
import { AnalyticsOperationsService } from './service/analytics-operations.service';

/**
 * Clinic analytics (P29). Read-only dashboards inside the HMS portal (D-050).
 * Later tickets add one repository that may read other modules' tables for
 * aggregates only (D-049); nothing in this module writes clinical data.
 */
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsOperationsController],
  providers: [AnalyticsOperationsService],
})
export class AnalyticsModule {}
