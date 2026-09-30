import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AnalyticsExportCell,
  AnalyticsExportDashboardValue,
  AnalyticsExportFile,
  AnalyticsExportRunner,
  AnalyticsFilterInput,
  ExportAnalyticsParams,
} from '@hms/shared-types';

import { AuditAction } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { AnalyticsFinanceService } from './analytics-finance.service';
import { AnalyticsOperationsService } from './analytics-operations.service';
import { AnalyticsReportingHealthService } from './analytics-reporting-health.service';
import { buildAnalyticsExportCsv } from './build-analytics-export-csv';
import { FINANCE_EXPORT_TABLES } from './finance-export-tables';
import { OPERATIONS_EXPORT_TABLES } from './operations-export-tables';
import { REPORTING_EXPORT_TABLES } from './reporting-export-tables';
import { toAnalyticsExportRunner } from './to-analytics-export-runner';

const ANALYTICS_AUDIT_RESOURCE = 'analytics';
const PAYER_LABELS: Readonly<Record<string, string>> = {
  GENERAL: 'Umum',
  BPJS: 'BPJS',
  INSURANCE: 'Asuransi',
};

/**
 * CSV export for every analytics dashboard (P29-T10, PRD FR-FDN-07): the
 * aggregate tables the screen shows, never a row about a patient, and one
 * `EXPORT` audit row per file with the filters and the row count (NFR-AN-08).
 *
 * A dashboard exports by registering a spec here: its title, how to read it,
 * and its tables. The route checks `analytics.export` and the dashboard's own
 * read key before this runs.
 */
@Injectable()
export class AnalyticsExportService {
  private readonly runners: Readonly<Record<AnalyticsExportDashboardValue, AnalyticsExportRunner>>;

  constructor(
    operationsService: AnalyticsOperationsService,
    financeService: AnalyticsFinanceService,
    reportingHealthService: AnalyticsReportingHealthService,
    private readonly auditService: AuditService,
  ) {
    this.runners = {
      operations: toAnalyticsExportRunner({
        dashboard: 'operations',
        title: 'Operasional',
        load: (filter) => operationsService.getOperations(filter),
        tables: OPERATIONS_EXPORT_TABLES,
      }),
      finance: toAnalyticsExportRunner({
        dashboard: 'finance',
        title: 'Keuangan',
        load: (filter) => financeService.getFinance(filter),
        tables: FINANCE_EXPORT_TABLES,
      }),
      reporting: toAnalyticsExportRunner({
        dashboard: 'reporting',
        title: 'Status pelaporan',
        load: (filter) => reportingHealthService.getReportingHealth(filter),
        tables: REPORTING_EXPORT_TABLES,
      }),
    };
  }

  /** Builds the file and records the export; refuses a table the dashboard does not have. */
  async exportDashboard({
    dashboard,
    query,
    actorUserId,
  }: ExportAnalyticsParams): Promise<AnalyticsExportFile> {
    const runner = this.runners[dashboard];
    const { tables: requestedKeys, ...filter } = query;
    const tableKeys = this.resolveTableKeys(runner, requestedKeys);
    // The screen's comparison period is not part of the file: every table is this period's.
    const period: AnalyticsFilterInput = { ...filter, compare: false };
    const result = await runner.run(period, tableKeys);
    const rowCount = result.tables.reduce((total, table) => total + table.rows.length, 0);
    const csv = buildAnalyticsExportCsv({
      dashboardTitle: runner.title,
      meta: result.meta,
      filterLines: this.describeFilter(period),
      tables: result.tables,
    });
    await this.auditService.recordOrThrow({
      action: AuditAction.EXPORT,
      resource: ANALYTICS_AUDIT_RESOURCE,
      actorUserId,
      metadata: { dashboard, filters: { ...period, tables: tableKeys }, rowCount },
    });
    return {
      fileName: `metaklinik-${dashboard}-${result.meta.from}-${result.meta.to}.csv`,
      csv,
      rowCount,
    };
  }

  private resolveTableKeys(
    runner: AnalyticsExportRunner,
    requestedKeys: readonly string[] | undefined,
  ): readonly string[] {
    if (requestedKeys === undefined) {
      return runner.tableKeys;
    }
    const unknownKeys = requestedKeys.filter((key) => !runner.tableKeys.includes(key));
    if (unknownKeys.length > 0 || requestedKeys.length === 0) {
      throw new BadRequestException({
        code: 'ANALYTICS_EXPORT_UNKNOWN_TABLE',
        message: `Choose tables from: ${runner.tableKeys.join(', ')}`,
      });
    }
    return requestedKeys;
  }

  /** The narrowing filters, written under the period so the file says what it holds. */
  private describeFilter(filter: AnalyticsFilterInput): AnalyticsExportCell[][] {
    return [
      ...(filter.specialtyId ? [['Poli (id)', filter.specialtyId]] : []),
      ...(filter.doctorId ? [['Dokter (id)', filter.doctorId]] : []),
      ...(filter.payerType
        ? [['Penjamin', PAYER_LABELS[filter.payerType] ?? filter.payerType]]
        : []),
    ];
  }
}
