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
import { TaxReportPdfService } from '../service/tax-report-pdf.service';
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
  constructor(
    private readonly taxReportService: TaxReportService,
    private readonly taxReportPdfService: TaxReportPdfService,
  ) {}

  @Get()
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: "List a year's monthly tax reports",
    responseDescription:
      'Every stored report of the year with its headline figure and whether it still matches the books (`isOutOfDate`). `meta.applicableKinds` names the reports the tax profile calls for: PP55_OMZET on the 0.5% regime, PPN_OUTPUT for a PKP, PPH21_NON_EMPLOYEE for every clinic.',
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
      'Recomputes and freezes the month. Refused while the month is running (409 `TAX_REPORT_PERIOD_OPEN`), for an already finalized report (409 `TAX_REPORT_FINALIZED`) and for a PPh 21 draft with a clinician who has neither NPWP nor NIK (409 `TAX_REPORT_IDENTITY_INCOMPLETE`). Audited as `TAX_REPORT_FINALIZED`.',
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

  @Get(':id/identifiers')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: "Reveal the clinicians' tax identities on a PPh 21 report",
    responseDescription:
      'P27-T07. The full NPWP, or the NIK serving as NPWP, of every clinician on the report, for the BP21. The report itself carries only masked identities; this read decrypts and is audited as `DOCTOR_IDENTIFIER_UNMASKED` without the values. 409 `TAX_REPORT_NOT_APPLICABLE` for a report of another kind.',
    responseExample: { data: TAXES_EXAMPLES.taxReports.identifiers },
  })
  async revealIdentifiers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.taxReportService.revealIdentifiers(
        id,
        this.assertAuthenticated(currentUser),
      ),
    };
  }

  @Get(':id/export')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  // Plain Swagger decorators: this route returns a file, not a JSON envelope.
  @ApiOperation({ summary: 'Export one monthly tax report as CSV' })
  @ApiOkResponse({
    description:
      'The stored report as CSV: a header block with totals, billing code and due dates, then one row per payment or invoice — or, for PPh 21, one BP21 row per clinician with the full NPWP or NIK (that read is audited as `DOCTOR_IDENTIFIER_UNMASKED`). Totals equal the report to the rupiah. Audited as an export.',
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

  @Post(':id/pdf')
  @HttpCode(200)
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  // Plain Swagger decorators: this route answers with the PDF itself.
  @ApiOperation({
    summary: 'Download one monthly tax report as PDF',
    description:
      'P27-T12. A DRAFT is rendered on every request with a DRAFT watermark and is never stored. A FINALIZED report is rendered once and stored; every later download is the same file. Audited as an export. 503 `TAX_REPORT_PDF_UNAVAILABLE` when the renderer or storage fails; a failed render is retried on the next request.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'The report as an A4 PDF.',
    schema: { type: 'string', format: 'binary' },
  })
  async renderPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const pdf = await this.taxReportPdfService.renderPdf(id, this.assertAuthenticated(currentUser));
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    response.end(Buffer.from(pdf.bytes));
  }

  @Get(':id/pdf/download-url')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: "A signed link to a finalized report's PDF",
    responseDescription:
      'P27-T12. Renders and stores the PDF on first use, then always links the same file. 409 `TAX_REPORT_NOT_FINALIZED` for a DRAFT, whose PDF is never stored. Audited as an export.',
    responseExample: { data: TAXES_EXAMPLES.taxReports.pdfDownload },
  })
  async createPdfDownloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.taxReportPdfService.createPdfDownloadUrl(
        id,
        this.assertAuthenticated(currentUser),
      ),
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
