import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsOperationsData,
  AnalyticsOperationsPeriodSnapshot,
  AnalyticsRange,
  AnalyticsResponse,
} from '@hms/shared-types';

import { AnalyticsOperationsRepository } from '../repository/analytics-operations.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { buildAnalyticsOperationsData } from './build-analytics-operations-data';

/**
 * The operations dashboard (P29-T04, PRD FR-OPS-01 to 05): visits by type,
 * new against returning patients, poli and doctor, appointment outcomes and
 * booking channel, for the filter's range and, with `compare`, its
 * comparison period.
 */
@Injectable()
export class AnalyticsOperationsService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsOperationsRepository: AnalyticsOperationsRepository,
  ) {}

  /** Reads the operations dashboard for a filter, from cache when fresh. */
  getOperations(filter: AnalyticsFilterInput): Promise<AnalyticsResponse<AnalyticsOperationsData>> {
    this.assertPayerFilterUnused(filter);
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'operations', filter },
      load: () => this.loadOperations(filter),
    });
  }

  /**
   * Visits do not record who pays yet; P29-T07 adds the field. Until then a
   * payer filter is refused rather than silently ignored, because a number
   * labelled "BPJS only" that counts everyone is worse than no number.
   */
  private assertPayerFilterUnused(filter: AnalyticsFilterInput): void {
    if (filter.payerType !== undefined) {
      throw new BadRequestException({
        code: 'ANALYTICS_PAYER_FILTER_UNAVAILABLE',
        message: 'Filtering by payer is not available yet.',
      });
    }
  }

  private async loadOperations(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsOperationsData>> {
    const generatedAt = new Date();
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const current = await this.readPeriod(range, filter);
    const comparison = comparisonRange ? await this.readPeriod(comparisonRange, filter) : undefined;
    return {
      data: buildAnalyticsOperationsData({ current, comparison }),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private async readPeriod(
    range: AnalyticsRange,
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsOperationsPeriodSnapshot> {
    const snapshot = await this.analyticsOperationsRepository.readSnapshot(
      this.analyticsRangeService.buildSqlScope(range, filter),
    );
    return { range, snapshot };
  }
}
