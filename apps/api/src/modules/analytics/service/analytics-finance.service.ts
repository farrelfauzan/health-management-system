import { Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsFinanceData,
  AnalyticsFinancePeriodSnapshot,
  AnalyticsResponse,
  ReadFinancePeriodParams,
} from '@hms/shared-types';

import { AnalyticsFinanceRepository } from '../repository/analytics-finance.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { buildAnalyticsFinanceData } from './build-analytics-finance-data';

/**
 * The finance dashboard (P29-T08, PRD FR-FIN-01 to 06): revenue by invoice
 * date (Q-3), cash received by payment date, and their splits by method,
 * service, clinician, poli and payer, with unpaid invoices by age.
 */
@Injectable()
export class AnalyticsFinanceService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsFinanceRepository: AnalyticsFinanceRepository,
  ) {}

  /** Reads the finance dashboard for a filter, from cache when fresh. */
  getFinance(filter: AnalyticsFilterInput): Promise<AnalyticsResponse<AnalyticsFinanceData>> {
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'finance', filter: { ...filter } },
      load: () => this.loadFinance(filter),
    });
  }

  private async loadFinance(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsFinanceData>> {
    const generatedAt = new Date();
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const current = await this.readPeriod({ range, filter });
    const comparison = comparisonRange
      ? await this.readPeriod({ range: comparisonRange, filter })
      : undefined;
    return {
      data: buildAnalyticsFinanceData({ current, comparison }),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private async readPeriod({
    range,
    filter,
  }: ReadFinancePeriodParams): Promise<AnalyticsFinancePeriodSnapshot> {
    const snapshot = await this.analyticsFinanceRepository.readSnapshot(
      this.analyticsRangeService.buildSqlScope(range, filter),
    );
    return { range, snapshot };
  }
}
