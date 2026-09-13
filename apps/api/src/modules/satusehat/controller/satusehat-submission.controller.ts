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
import { SatusehatSubmissionOpsService } from '../service/satusehat-submission-ops.service';

@ApiTags('SATUSEHAT')
@RequireFeature('satusehat')
@Controller({
  version: '1',
  path: 'satusehat',
})
export class SatusehatSubmissionController {
  constructor(private readonly submissionOpsService: SatusehatSubmissionOpsService) {}

  @Get('environment')
  @Auth([{ action: 'read', subject: 'SatusehatSubmission' }])
  @ApiEndpoint({
    summary: 'Which SATUSEHAT environment this deployment reports to',
    responseDescription:
      'Whether submissions reach the production national record or the shared staging sandbox, derived from the configured base URL so it cannot disagree with where bundles actually go (P21-T06). A SUBMITTED row against the sandbox proves the integration works and proves nothing to the patient, whose SATUSEHAT Mobile reads production only. Carries no credentials and no organization id.',
    responseExample: { data: SATUSEHAT_EXAMPLES.environmentStatus },
  })
  getEnvironment(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);

    return { data: this.submissionOpsService.getEnvironmentStatus() };
  }

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
