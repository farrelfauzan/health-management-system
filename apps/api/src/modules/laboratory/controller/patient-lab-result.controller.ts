import { Controller, Get, Param, ParseUUIDPipe, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { ListPatientLabResultsQueryDto } from '../dto/list-patient-lab-results-query.dto';
import { LabResultService } from '../service/lab-result.service';

/**
 * A patient's own laboratory history, across visits (`P18-T04`) — what the
 * doctor's per-test trend is drawn from.
 *
 * A secondary route on the patient rather than a filter on the order list,
 * because the question it answers is about the person and not about a request:
 * "what has this haemoglobin been doing".
 */
@ApiTags('Laboratory Results')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'patients' })
export class PatientLabResultController {
  constructor(private readonly labResultService: LabResultService) {}

  @Get(':id/lab-results')
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-result', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'List a patient’s released laboratory results',
    responseDescription:
      'Released values only, newest first — an unverified number is not a data point, and a doctor comparing this month against last must never be shown something nobody has signed. Superseded versions are left out: a corrected value replaces the first rather than joining it. Narrow to one test with `testCode`; each row carries the reference band it was judged against, which may differ from the catalog’s current band.',
    responseExample: { data: [LABORATORY_EXAMPLES.labResult.trendItem] },
    notFoundDescription: 'Patient not found.',
  })
  async listPatientLabResults(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListPatientLabResultsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labResultService.listPatientLabResults(
        id,
        query,
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
