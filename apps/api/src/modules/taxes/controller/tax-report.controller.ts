import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { TAXES_EXAMPLES } from '../../../common/openapi/taxes-examples';
import { CreateTaxReportDto } from '../dto/create-tax-report.dto';
import { ListTaxReportsQueryDto } from '../dto/list-tax-reports-query.dto';
import { TaxReportService } from '../service/tax-report.service';

/**
 * Monthly tax report drafts (P27-T05, `docs/post-mvp/decisions.md` D-038):
 * the figures the clinic pays and files in Coretax itself. Drafts, never
 * filings.
 */
@ApiTags('Tax Reports')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/reports' })
export class TaxReportController {
  constructor(private readonly taxReportService: TaxReportService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: "List a year's monthly tax reports",
    responseDescription:
      'Every stored report of the year with its headline figure and whether it still matches the books (`isOutOfDate`). `meta.applicableKinds` names the reports the tax profile calls for: PP55_OMZET on the 0.5% regime, PPN_OUTPUT for a PKP.',
    responseExample: {
      data: [TAXES_EXAMPLES.taxReports.listItem],
      meta: TAXES_EXAMPLES.taxReports.listMeta,
    },
  })
  async listReports(@Query() query: ListTaxReportsQueryDto) {
    const result = await this.taxReportService.listReports(query.year);
    return { data: result.items, meta: result.meta };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: 'Create the draft for a month',
    responseDescription:
      'Computes a DRAFT for the month from the books. 409 `TAX_REPORT_NOT_APPLICABLE` when the tax profile does not call for it, `TAX_REPORT_EXISTS` when the month has one, `TAX_REPORT_PERIOD_IN_FUTURE` for a month that has not started.',
    responseExample: { data: TAXES_EXAMPLES.taxReports.view, message: 'Tax report drafted' },
    requestType: CreateTaxReportDto,
    requestExample: TAXES_EXAMPLES.taxReports.createRequest,
    successStatus: 201,
  })
  async createReport(@Body() payload: CreateTaxReportDto, @AuthUser() currentUser?: CurrentUser) {
    return {
      data: await this.taxReportService.createReport(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Tax report drafted',
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: 'Read one monthly tax report',
    responseDescription:
      'The stored figures and lines, compared with the books as they are now: `differences` lists every total that changed since, for example an invoice voided after the report was finalized. A finalized report is never rewritten.',
    responseExample: { data: TAXES_EXAMPLES.taxReports.view },
  })
  async getReport(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.taxReportService.getReport(id) };
  }

  @Post(':id/recompute')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: 'Recompute a draft from the books',
    responseDescription: 'DRAFT only; 409 `TAX_REPORT_FINALIZED` for a finalized report.',
    responseExample: { data: TAXES_EXAMPLES.taxReports.view, message: 'Tax report recomputed' },
  })
  async recomputeReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.taxReportService.recomputeReport(id, this.assertAuthenticated(currentUser)),
      message: 'Tax report recomputed',
    };
  }

  @Post(':id/finalize')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: 'Finalize a monthly tax report',
    responseDescription:
      'Recomputes and freezes the month. Refused while the month is running (409 `TAX_REPORT_PERIOD_OPEN`) and for an already finalized report (409 `TAX_REPORT_FINALIZED`). Audited as `TAX_REPORT_FINALIZED`.',
    responseExample: {
      data: { ...TAXES_EXAMPLES.taxReports.view, status: 'FINALIZED' },
      message: 'Tax report finalized',
    },
  })
  async finalizeReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.taxReportService.finalizeReport(id, this.assertAuthenticated(currentUser)),
      message: 'Tax report finalized',
    };
  }

  @Get(':id/export')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  // Plain Swagger decorators: this route returns a file, not a JSON envelope.
  @ApiOperation({ summary: 'Export one monthly tax report as CSV' })
  @ApiOkResponse({
    description:
      'The stored report as CSV: a header block with totals, billing code and due dates, then one row per payment or invoice. Totals equal the report to the rupiah. Audited as an export.',
  })
  @ApiProduces('text/csv')
  async exportReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const exported = await this.taxReportService.exportReport(
      id,
      this.assertAuthenticated(currentUser),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    response.end(exported.csv);
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
