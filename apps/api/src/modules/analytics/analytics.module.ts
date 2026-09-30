import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AnalyticsCaseMixController } from './controller/analytics-case-mix.controller';
import { AnalyticsExportController } from './controller/analytics-export.controller';
import { AnalyticsFinanceController } from './controller/analytics-finance.controller';
import { AnalyticsLaboratoryController } from './controller/analytics-laboratory.controller';
import { AnalyticsOperationsController } from './controller/analytics-operations.controller';
import { AnalyticsPharmacyController } from './controller/analytics-pharmacy.controller';
import { AnalyticsPracticeController } from './controller/analytics-practice.controller';
import { AnalyticsReportingHealthController } from './controller/analytics-reporting-health.controller';
import { AnalyticsCaseMixRepository } from './repository/analytics-case-mix.repository';
import { AnalyticsFinanceRepository } from './repository/analytics-finance.repository';
import { AnalyticsLaboratoryRepository } from './repository/analytics-laboratory.repository';
import { AnalyticsOperationsDepthRepository } from './repository/analytics-operations-depth.repository';
import { AnalyticsOperationsRepository } from './repository/analytics-operations.repository';
import { AnalyticsPharmacyRepository } from './repository/analytics-pharmacy.repository';
import { AnalyticsPracticeRepository } from './repository/analytics-practice.repository';
import { AnalyticsQueryRepository } from './repository/analytics-query.repository';
import { AnalyticsReportingHealthRepository } from './repository/analytics-reporting-health.repository';
import { AnalyticsCacheService } from './service/analytics-cache.service';
import { AnalyticsCaseMixService } from './service/analytics-case-mix.service';
import { AnalyticsExportService } from './service/analytics-export.service';
import { AnalyticsFinanceService } from './service/analytics-finance.service';
import { AnalyticsLaboratoryService } from './service/analytics-laboratory.service';
import { AnalyticsOperationsService } from './service/analytics-operations.service';
import { AnalyticsPharmacyService } from './service/analytics-pharmacy.service';
import { AnalyticsPracticeService } from './service/analytics-practice.service';
import { AnalyticsRangeService } from './service/analytics-range.service';
import { AnalyticsReportingHealthService } from './service/analytics-reporting-health.service';

/**
 * Clinic analytics (P29). Read-only dashboards inside the HMS portal (D-050).
 * `AnalyticsQueryRepository` is the one repository allowed to read other
 * modules' tables, for aggregates only and inside a read-only transaction
 * (D-049); nothing in this module writes.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AnalyticsOperationsController,
    AnalyticsReportingHealthController,
    AnalyticsFinanceController,
    AnalyticsCaseMixController,
    AnalyticsPharmacyController,
    AnalyticsLaboratoryController,
    AnalyticsPracticeController,
    AnalyticsExportController,
  ],
  providers: [
    AnalyticsOperationsService,
    AnalyticsRangeService,
    AnalyticsCacheService,
    AnalyticsQueryRepository,
    AnalyticsOperationsRepository,
    AnalyticsOperationsDepthRepository,
    AnalyticsReportingHealthService,
    AnalyticsReportingHealthRepository,
    AnalyticsFinanceService,
    AnalyticsFinanceRepository,
    AnalyticsCaseMixService,
    AnalyticsCaseMixRepository,
    AnalyticsPharmacyService,
    AnalyticsPharmacyRepository,
    AnalyticsLaboratoryService,
    AnalyticsLaboratoryRepository,
    AnalyticsPracticeService,
    AnalyticsPracticeRepository,
    AnalyticsExportService,
  ],
})
export class AnalyticsModule {}
