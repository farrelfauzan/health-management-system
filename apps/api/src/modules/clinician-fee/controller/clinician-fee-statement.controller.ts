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
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CLINICIAN_FEE_EXAMPLES } from '../../../common/openapi/clinician-fee-examples';
import { ClinicianFeeStatementQueryDto } from '../dto/clinician-fee-statement-query.dto';
import { ClinicianFeeStatementService } from '../service/clinician-fee-statement.service';

/**
 * Monthly jasa medis statements (P27-T06). A month is the clinic-local month
 * an entry was written in: the payment month for an accrual, the void month
 * for its reversal.
 */
@ApiTags('Clinician Fees')
@Controller({ version: '1', path: 'clinician-fees/statements' })
export class ClinicianFeeStatementController {
  constructor(private readonly clinicianFeeStatementService: ClinicianFeeStatementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'ClinicianFee' }])
  @ApiEndpoint({
    summary: "A month's jasa medis totals per clinician",
    responseDescription:
      'Every clinician with ledger entries in the month, sorted by name, with the sum of what patients paid for their lines, their gross fee and the clinic share. Reversals count negative.',
    responseExample: { data: CLINICIAN_FEE_EXAMPLES.statements.summary },
  })
  async getPeriodSummary(@Query() query: ClinicianFeeStatementQueryDto) {
    return { data: await this.clinicianFeeStatementService.getPeriodSummary(query.period) };
  }

  @Get(':doctorId')
  @Auth([{ action: 'read', subject: 'ClinicianFee' }])
  @ApiEndpoint({
    summary: "One clinician's monthly jasa medis statement",
    responseDescription:
      'Every ledger entry of the month in time order and their totals. 404 for an unknown clinician; a clinician with no entries gets an empty statement.',
    responseExample: { data: CLINICIAN_FEE_EXAMPLES.statements.statement },
  })
  async getStatement(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Query() query: ClinicianFeeStatementQueryDto,
  ) {
    return {
      data: await this.clinicianFeeStatementService.getStatement(doctorId, query.period),
    };
  }

  @Get(':doctorId/export')
  @Auth([{ action: 'read', subject: 'ClinicianFee' }])
  // Plain Swagger decorators: this route returns a file, not a JSON envelope.
  @ApiOperation({ summary: "Export one clinician's monthly jasa medis statement as CSV" })
  @ApiOkResponse({
    description:
      'A header block with the totals, then one row per ledger entry. Totals equal the on-screen statement. Audited as an export.',
  })
  @ApiProduces('text/csv')
  async exportStatement(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Query() query: ClinicianFeeStatementQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const exported = await this.clinicianFeeStatementService.exportStatement(
      doctorId,
      query.period,
      this.assertAuthenticated(currentUser),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    response.end(exported.csv);
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Authentication is required');
    }
    return currentUser;
  }
}
