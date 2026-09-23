import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CoretaxFakturExportQueryDto } from '../dto/coretax-faktur-export-query.dto';
import { CoretaxFakturExportService } from '../service/coretax-faktur-export.service';

/**
 * Coretax Faktur Keluaran files for finalized PPN keluaran reports (P27-T09):
 * the bulk import DJP's converter v1.6 produces, for a PKP clinic to upload
 * in Coretax. Never a filing.
 */
@ApiTags('Tax Reports')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/reports' })
export class TaxReportCoretaxFakturController {
  constructor(private readonly coretaxFakturExportService: CoretaxFakturExportService) {}

  @Get(':id/coretax/faktur-keluaran/validation')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: 'Check a PPN keluaran report against the Coretax Faktur Keluaran template',
    responseDescription:
      "P27-T09. Every problem that would stop the faktur file — the clinic NPWP (16 digits) and NITKU (22), and per invoice a Coretax item code and unit on every line, a kode-08 facility, and the patient's name and address — listed at once. `digunggungCount` invoices have a patient without NIK and are left out. Reads no identifier back and is not audited. 409 `TAX_REPORT_NOT_APPLICABLE` for another report kind, `TAX_REPORT_NOT_FINALIZED` for a draft.",
    responseExample: { data: TAXES_EXAMPLES.taxReports.coretaxFakturValidation },
  })
  async validateFaktur(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.coretaxFakturExportService.validateExport(id) };
  }

  @Get(':id/coretax/faktur-keluaran')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  // Plain Swagger decorators: this route returns a file, not a JSON envelope.
  @ApiOperation({
    summary: 'Export a finalized PPN keluaran report as a Coretax Faktur Keluaran XML file',
    description:
      "P27-T09. The `TaxInvoiceBulk` file DJP's converter v1.6 produces (pajak.go.id node 112031): one `TaxInvoice` per invoice and faktur code (04 goods at DPP nilai lain, 08 exempt services with their facility), the patient as buyer by NIK. 422 `CORETAX_EXPORT_INVALID` with `details` listing every problem; 409 `TAX_REPORT_NOT_FINALIZED` for a draft. Audited as an export and as `PATIENT_IDENTIFIER_UNMASKED`, without the values.",
  })
  @ApiProduces('application/xml')
  @ApiOkResponse({
    description: 'The Faktur Keluaran bulk-import XML.',
    schema: { type: 'string', format: 'binary' },
  })
  async exportFaktur(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: CoretaxFakturExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const exported = await this.coretaxFakturExportService.exportXml({
      id,
      templateVersion: query.templateVersion,
      actor: this.assertAuthenticated(currentUser),
    });
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    response.end(exported.xml);
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
