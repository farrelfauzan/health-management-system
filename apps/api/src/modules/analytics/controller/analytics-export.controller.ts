import { Controller, Get, Query, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { AnalyticsExportDashboardValue } from '@hms/shared-types';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { AnalyticsExportQueryDto } from '../dto/analytics-export-query.dto';
import { AnalyticsExportService } from '../service/analytics-export.service';

const EXPORT_DESCRIPTION =
  "The dashboard's aggregate tables as CSV, one section per table under its title, for the same filter as the dashboard. `tables` is a comma-separated list of table keys; omitted, every table is written, and an unknown key answers 400 `ANALYTICS_EXPORT_UNKNOWN_TABLE`. UTF-8 with a BOM so Excel opens it; the file is `metaklinik-<dashboard>-<from>-<to>.csv`. Needs `analytics.export` and the dashboard's own read key. No patient appears in it. Every export writes one `EXPORT` audit row with the dashboard, the filters and the row count.";

/**
 * CSV export for the analytics dashboards (P29-T10). One route per dashboard
 * because each needs its own read key beside `analytics.export`, and the
 * permission guard reads its rules from the route: a dashboard added later
 * registers its tables in `AnalyticsExportService` and one route here.
 */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics' })
export class AnalyticsExportController {
  constructor(private readonly analyticsExportService: AnalyticsExportService) {}

  @Get('operations/export')
  @Auth([
    { action: 'export', subject: 'Analytics' },
    { action: 'read-operations', subject: 'Analytics' },
  ])
  @ApiOperation({ summary: 'Export the operations dashboard as CSV' })
  @ApiOkResponse({ description: EXPORT_DESCRIPTION })
  @ApiProduces('text/csv')
  exportOperations(
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ): Promise<void> {
    return this.sendExport({ dashboard: 'operations', query, response, currentUser });
  }

  @Get('finance/export')
  @Auth([
    { action: 'export', subject: 'Analytics' },
    { action: 'read-finance', subject: 'Analytics' },
  ])
  @ApiOperation({ summary: 'Export the finance dashboard as CSV' })
  @ApiOkResponse({ description: EXPORT_DESCRIPTION })
  @ApiProduces('text/csv')
  exportFinance(
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ): Promise<void> {
    return this.sendExport({ dashboard: 'finance', query, response, currentUser });
  }

  @Get('case-mix/export')
  @Auth([
    { action: 'export', subject: 'Analytics' },
    { action: 'read-clinical', subject: 'Analytics' },
  ])
  @ApiOperation({ summary: 'Export the case-mix dashboard as CSV' })
  @ApiOkResponse({ description: EXPORT_DESCRIPTION })
  @ApiProduces('text/csv')
  exportCaseMix(
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ): Promise<void> {
    return this.sendExport({ dashboard: 'case-mix', query, response, currentUser });
  }

  @Get('pharmacy/export')
  @Auth([
    { action: 'export', subject: 'Analytics' },
    { action: 'read-pharmacy', subject: 'Analytics' },
  ])
  @ApiOperation({ summary: 'Export the pharmacy dashboard as CSV' })
  @ApiOkResponse({ description: EXPORT_DESCRIPTION })
  @ApiProduces('text/csv')
  exportPharmacy(
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ): Promise<void> {
    return this.sendExport({ dashboard: 'pharmacy', query, response, currentUser });
  }

  @Get('laboratory/export')
  @Auth([
    { action: 'export', subject: 'Analytics' },
    { action: 'read-lab', subject: 'Analytics' },
  ])
  @ApiOperation({ summary: 'Export the laboratory dashboard as CSV' })
  @ApiOkResponse({ description: EXPORT_DESCRIPTION })
  @ApiProduces('text/csv')
  exportLaboratory(
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ): Promise<void> {
    return this.sendExport({ dashboard: 'laboratory', query, response, currentUser });
  }

  @Get('reporting/export')
  @Auth([
    { action: 'export', subject: 'Analytics' },
    { action: 'read-operations', subject: 'Analytics' },
  ])
  @ApiOperation({ summary: 'Export the reporting status page as CSV' })
  @ApiOkResponse({ description: EXPORT_DESCRIPTION })
  @ApiProduces('text/csv')
  exportReporting(
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ): Promise<void> {
    return this.sendExport({ dashboard: 'reporting', query, response, currentUser });
  }

  private async sendExport(params: {
    dashboard: AnalyticsExportDashboardValue;
    query: AnalyticsExportQueryDto;
    response: BinaryResponseWriter;
    currentUser?: CurrentUser;
  }): Promise<void> {
    if (!params.currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    const exported = await this.analyticsExportService.exportDashboard({
      dashboard: params.dashboard,
      query: params.query,
      actorUserId: params.currentUser.sub,
    });
    params.response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    params.response.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    params.response.end(exported.csv);
  }
}
