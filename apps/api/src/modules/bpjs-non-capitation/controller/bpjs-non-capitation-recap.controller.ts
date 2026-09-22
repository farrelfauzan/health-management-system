import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_NON_CAPITATION_EXAMPLES } from '../../../common/openapi/bpjs-non-capitation-examples';
import { MarkNonCapitationLinesDto } from '../dto/mark-non-capitation-lines.dto';
import { NonCapitationRecapQueryDto } from '../dto/non-capitation-recap-query.dto';
import { buildNonCapitationCsv } from '../service/build-non-capitation-csv';
import { BpjsNonCapitationPdfService } from '../service/bpjs-non-capitation-pdf.service';
import { BpjsNonCapitationRecapService } from '../service/bpjs-non-capitation-recap.service';

const HTTP_OK = 200;

/**
 * The bidan jejaring's monthly BPJS non-capitation recap for the induk FKTP
 * (P25-T16, SJ-239). ADMIN only: this is D-033's billing-line opening
 * (Pasal 32(2)(c) and 34(1)(c)) — participant, service type, date, tariff,
 * claim status and document-category presence, never clinical content.
 */
@ApiTags('BPJS Non-Capitation')
@RequireFeature('bpjs-pcare')
@Controller({ version: '1', path: 'bpjs/non-capitation' })
export class BpjsNonCapitationRecapController {
  constructor(
    private readonly recapService: BpjsNonCapitationRecapService,
    private readonly pdfService: BpjsNonCapitationPdfService,
  ) {}

  @Get('recap')
  @Auth([{ action: 'read', subject: 'BpjsNonCapitation' }])
  @ApiEndpoint({
    summary: 'Monthly BPJS non-capitation claim recap',
    responseDescription:
      "One line per payable unit of the month for BPJS participants (a patient with a BPJS number), derived from FINISHED antenatal and nifas encounters, recorded births and KB acts — not the PCare outbox. Each line carries the Permenkes 3/2023 tariff valid on its date with its article and page, the Peraturan BPJS 7/2018 document checklist by filed category, and a status: SENT once marked, else OPEN, DUE_SOON in the 5 days before the induk's filing date, LATE after it, EXPIRED six months after the service. `format` answers the JSON preview by default; `csv` streams UTF-8 with BOM (`text/csv`), `pdf` the letter to the induk (`application/pdf`); both files are audited as an export.",
    responseExample: { data: BPJS_NON_CAPITATION_EXAMPLES.recap },
  })
  async getRecap(
    @Query() query: NonCapitationRecapQueryDto,
    @Res({ passthrough: true }) response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const recap = await this.recapService.getRecap(query.month);
    const format = query.format ?? 'json';
    if (format === 'json') {
      return { data: recap };
    }
    const actor = this.assertAuthenticated(currentUser);
    await this.recapService.recordExport({
      month: query.month,
      format: format === 'csv' ? 'CSV' : 'PDF',
      lineCount: recap.lines.length,
      actor,
    });
    const fileName = `rekap-non-kapitasi-${query.month}`;
    if (format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
      response.end(buildNonCapitationCsv(recap));
      return undefined;
    }
    const bytes = await this.pdfService.renderLetter(recap);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    response.end(Buffer.from(bytes));
    return undefined;
  }

  @Post('marks')
  @HttpCode(HTTP_OK)
  @Auth([{ action: 'write', subject: 'BpjsNonCapitation' }])
  @ApiEndpoint({
    summary: 'Mark recap lines as sent to the induk FKTP',
    responseDescription:
      'Per-item result: MARKED, ALREADY_MARKED (a second mark is a no-op) or NOT_IN_RECAP when the source is not a line of that month. Each newly marked line writes one NON_CAPITATION_CLAIM_MARKED audit row.',
    responseExample: { data: BPJS_NON_CAPITATION_EXAMPLES.markResponse },
    requestType: MarkNonCapitationLinesDto,
    requestExample: BPJS_NON_CAPITATION_EXAMPLES.markRequest,
  })
  async markLines(@Body() body: MarkNonCapitationLinesDto, @AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.recapService.markLines(body, actor) };
  }

  private assertAuthenticated(currentUser: CurrentUser | undefined): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
