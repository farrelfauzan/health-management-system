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
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_PCARE_EXAMPLES } from '../../../common/openapi/bpjs-pcare-examples';
import { ListBpjsSubmissionsQueryDto } from '../dto/list-bpjs-submissions-query.dto';
import { BpjsSubmissionOpsService } from '../service/bpjs-submission-ops.service';

@ApiTags('BPJS PCare')
@Controller({
  version: '1',
  path: 'bpjs',
})
export class BpjsSubmissionController {
  constructor(private readonly submissionOpsService: BpjsSubmissionOpsService) {}

  @Get('submissions')
  @Auth([{ action: 'read', subject: 'BpjsSubmission' }])
  @ApiEndpoint({
    summary: 'List BPJS PCare submission outbox entries',
    responseDescription:
      'Paginated outbox rows, newest first, filterable by status, type, and registration. Scheduling state and the PCare reference number only — no payload snapshot exists, so nothing clinical leaks through the monitor. Filter by registrationId to render bridging status chips on a registration or its encounter.',
    responseExample: {
      data: [BPJS_PCARE_EXAMPLES.submission],
      meta: BPJS_PCARE_EXAMPLES.submissionListMeta,
    },
  })
  async listSubmissions(
    @Query() query: ListBpjsSubmissionsQueryDto,
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
  @Auth([{ action: 'retry', subject: 'BpjsSubmission' }])
  @ApiEndpoint({
    summary: 'Retry a failed BPJS PCare submission',
    responseDescription:
      'Requeues a FAILED row with a fresh attempt budget and processes it synchronously, returning the settled outcome (SUBMITTED with the PCare reference, PENDING with a scheduled retry, or FAILED again with a fresh readable reason). SUBMITTED and PENDING rows return 409 — one is done, the other needs no help.',
    responseExample: {
      data: BPJS_PCARE_EXAMPLES.submissionRetried,
      message: 'Submission retry processed',
    },
    notFoundDescription: 'BPJS submission not found.',
  })
  async retrySubmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.submissionOpsService.retrySubmission(id, actor);

    return {
      data: view,
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
