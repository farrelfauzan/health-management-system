import { Controller, Get, Param, ParseUUIDPipe, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { LabReportService } from '../service/lab-report.service';

/**
 * The hasil laboratorium of one order (P18-T05): the current PDF to download,
 * and every version there has been. Read under the order's own rule —
 * `lab-order.read`, OWN scope resolving through the encounter — because the
 * sheet says nothing the results routes do not already say.
 */
@ApiTags('Laboratory Orders')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'lab-orders' })
export class LabReportController {
  constructor(private readonly labReportService: LabReportService) {}

  @Get(':id/report')
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-report', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Download the current laboratory report',
    responseDescription:
      'A short-lived signed URL for the newest rendered version of the hasil laboratorium — the PDF filed on the visit as the patient’s LAB_RESULT document. 404 when nothing has rendered yet for an order never released; 409 while the first render is still queued or has failed, so a client polls the versions route rather than retrying blind. Older versions stay in the encounter’s document list.',
    responseExample: { data: LABORATORY_EXAMPLES.labReport.download },
    notFoundDescription: 'Lab order not found, or no report has been rendered for it.',
  })
  async downloadReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labReportService.createDownloadUrl(id, this.assertAuthenticated(currentUser)),
    };
  }

  @Get(':id/reports')
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-report', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'List the versions of a laboratory report',
    responseDescription:
      'Every rendering of the order’s report, newest first, with where each is: PENDING while the worker has it, READY with the document it became, FAILED with the reason after the last retry. `current` is the newest READY one. A release queues version 1; every amendment queues the next, and the previous one is never overwritten.',
    responseExample: { data: LABORATORY_EXAMPLES.labReport.view },
    notFoundDescription: 'Lab order not found.',
  })
  async listReports(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labReportService.listReports(id, this.assertAuthenticated(currentUser)),
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
