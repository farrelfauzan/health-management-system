import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AnalyticsOperationsController } from './controller/analytics-operations.controller';
import { AnalyticsQueryRepository } from './repository/analytics-query.repository';
import { AnalyticsCacheService } from './service/analytics-cache.service';
import { AnalyticsOperationsService } from './service/analytics-operations.service';
import { AnalyticsRangeService } from './service/analytics-range.service';

/**
 * Clinic analytics (P29). Read-only dashboards inside the HMS portal (D-050).
 * `AnalyticsQueryRepository` is the one repository allowed to read other
 * modules' tables, for aggregates only and inside a read-only transaction
 * (D-049); nothing in this module writes.
 */
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsOperationsController],
  providers: [
    AnalyticsOperationsService,
    AnalyticsRangeService,
    AnalyticsCacheService,
    AnalyticsQueryRepository,
  ],
})
export class AnalyticsModule {}
