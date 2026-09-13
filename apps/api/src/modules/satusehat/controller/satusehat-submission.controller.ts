import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SATUSEHAT_EXAMPLES } from '../../../common/openapi/satusehat-examples';
import { ListSatusehatSubmissionsQueryDto } from '../dto/list-satusehat-submissions-query.dto';
import { SatusehatSubmissionDetailService } from '../service/satusehat-submission-detail.service';
import { SatusehatSubmissionOpsService } from '../service/satusehat-submission-ops.service';

@ApiTags('SATUSEHAT')
@RequireFeature('satusehat')
@Controller({
  version: '1',
  path: 'satusehat',
})
export class SatusehatSubmissionController {
  constructor(
    private readonly submissionOpsService: SatusehatSubmissionOpsService,
    private readonly submissionDetailService: SatusehatSubmissionDetailService,
  ) {}

  @Get('submissions')
  @Auth([{ action: 'read', subject: 'SatusehatSubmission' }])
  @ApiEndpoint({
    summary: 'List SATUSEHAT submission outbox entries',
    responseDescription:
      'A paginated view of the submission outbox, newest first, filterable by kind, status, encounter and lab order. A row is either the bundle for one closed encounter or the laboratory chain for one released order (P18-T09). Rows carry scheduling state only — no clinical payload is stored in the outbox.',
    responseExample: {
      data: [SATUSEHAT_EXAMPLES.submission, SATUSEHAT_EXAMPLES.labReportSubmission],
      meta: SATUSEHAT_EXAMPLES.submissionListMeta,
    },
  })
  async listSubmissions(
    @Query() query: ListSatusehatSubmissionsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const result = await this.submissionOpsService.listSubmissions(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get('submissions/:id')
  @Auth([{ action: 'read', subject: 'SatusehatSubmission' }])
  @ApiEndpoint({
    summary: 'One SATUSEHAT submission and what it sent',
    responseDescription:
      'The outbox row plus its resource list (P21-T02) grouped by type: how many of each were sent, the ids SATUSEHAT assigned, and how many items were skipped per reason category. Presence only — no codes, names, values or patient identifiers, because this route is gated by the admin read grant. `hasResourceList` is false for a submission processed before the list shipped; those need the P21-T05 backfill.',
    responseExample: { data: SATUSEHAT_EXAMPLES.submissionDetail },
  })
  async getSubmissionDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);

    return { data: await this.submissionDetailService.getSubmissionDetail(id) };
  }

  @Post('submissions/:id/check')
  @HttpCode(200)
  @Auth([{ action: 'read', subject: 'SatusehatSubmission' }])
  @ApiEndpoint({
    summary: 'Check with SATUSEHAT whether it still holds what we sent',
    responseDescription:
      'Reads each recorded id back from the platform and reports, per resource, only whether SATUSEHAT holds it and its version — found, not found, unpaired (sent but its id was never resolved) or error. The projection is server-side and whitelisted: codes, values, narrative and names never leave the API. Reads are capped in concurrency and go through the shared client, so timeouts and the circuit breaker apply, and one failed read does not fail the check.',
    responseExample: { data: SATUSEHAT_EXAMPLES.submissionCheck },
  })
  async checkSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);

    return { data: await this.submissionDetailService.checkSubmission(id) };
  }

  @Post('submissions/:id/retry')
  @HttpCode(200)
  @Auth([{ action: 'retry', subject: 'SatusehatSubmission' }])
  @ApiEndpoint({
    summary: 'Retry a failed SATUSEHAT submission',
    responseDescription:
      'The FAILED row was re-opened with a fresh attempt budget and processed immediately; the returned row shows the real outcome (SUBMITTED, PENDING with a scheduled retry, or FAILED again with a new lastError). Retrying an encounter row that then succeeds also re-opens any laboratory reports that were parked waiting on it. Rows that are SUBMITTED or already queued return 409.',
    responseExample: {
      data: SATUSEHAT_EXAMPLES.submissionRetried,
      message: 'Submission retry processed',
    },
    notFoundDescription: 'SATUSEHAT submission not found.',
  })
  async retrySubmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const submission = await this.submissionOpsService.retrySubmission(id, actor);

    return {
      data: submission,
      message: 'Submission retry processed',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
