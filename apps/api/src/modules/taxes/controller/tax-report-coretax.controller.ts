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
import { CoretaxBp21ExportQueryDto } from '../dto/coretax-bp21-export-query.dto';
import { CoretaxBp21ExportService } from '../service/coretax-bp21-export.service';

/**
 * Coretax XML files for finalized monthly tax reports (P27-T08): the bulk
 * import DJP's own converters produce, for the clinic to upload in Coretax.
 * Never a filing.
 */
@ApiTags('Tax Reports')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/reports' })
export class TaxReportCoretaxController {
  constructor(private readonly coretaxBp21ExportService: CoretaxBp21ExportService) {}

  @Get(':id/coretax/bp21/validation')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  @ApiEndpoint({
    summary: 'Check a PPh 21 report against the Coretax BP21 template',
    responseDescription:
      'P27-T08. Every problem that would stop the BP21 file — the clinic NPWP (16 digits) and NITKU (22), and per clinician a 16-digit NPWP or NIK, a PTKP status and a positive gross — listed at once. Reads no identifier back and is not audited. 409 `TAX_REPORT_NOT_APPLICABLE` for another report kind, `TAX_REPORT_NOT_FINALIZED` for a draft.',
    responseExample: { data: TAXES_EXAMPLES.taxReports.coretaxBp21Validation },
  })
  async validateBp21(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.coretaxBp21ExportService.validateExport(id) };
  }

  @Get(':id/coretax/bp21')
  @Auth([{ action: 'read', subject: 'TaxReport' }])
  // Plain Swagger decorators: this route returns a file, not a JSON envelope.
  @ApiOperation({
    summary: 'Export a finalized PPh 21 report as a Coretax BP21 XML file',
    description:
      "P27-T08. The `Bp21Bulk` file DJP's BP21 v4 converter produces (pajak.go.id node 112031), one `Bp21` per clinician with the full NPWP or NIK. 422 `CORETAX_EXPORT_INVALID` with `details` listing every problem; 409 `TAX_REPORT_NOT_FINALIZED` for a draft. Audited as an export and as `DOCTOR_IDENTIFIER_UNMASKED`, without the values.",
  })
  @ApiProduces('application/xml')
  @ApiOkResponse({
    description: 'The BP21 bulk-import XML.',
    schema: { type: 'string', format: 'binary' },
  })
  async exportBp21(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: CoretaxBp21ExportQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const exported = await this.coretaxBp21ExportService.exportXml({
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
