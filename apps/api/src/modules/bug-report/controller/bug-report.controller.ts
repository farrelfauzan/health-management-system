import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BUG_REPORT_EXAMPLES } from '../../../common/openapi/bug-report-examples';
import { MAX_BUG_REPORT_USER_AGENT_LENGTH } from '@hms/shared-types';

import { CreateBugReportDto } from '../dto/create-bug-report.dto';
import { BugReportService } from '../service/bug-report.service';

const ACCEPTED_STATUS = 202;

@ApiTags('Bug Reports')
@RequireFeature('bug-reporting')
@Controller({
  version: '1',
  path: 'bug-reports',
})
export class BugReportController {
  constructor(private readonly bugReportService: BugReportService) {}

  @Post()
  @HttpCode(ACCEPTED_STATUS)
  @Auth([{ action: 'create', subject: 'BugReport' }])
  @ApiEndpoint({
    summary: 'File a bug report',
    successStatus: ACCEPTED_STATUS,
    requestType: CreateBugReportDto,
    requestExample: BUG_REPORT_EXAMPLES.createRequest,
    responseDescription:
      'Accepts the report and answers at once with its BR- reference: the AI triage and the Notion publish happen in a worker, so the reporter never waits on a vendor. Refused with SENSITIVE_DATA_DETECTED, naming the field and the category, when a free-text field looks like it contains a NIK, BPJS number, phone, email, medical record number or credential — the matched text is never echoed back. Eleven reports from one person in a rolling day gives 429.',
    responseExample: { data: BUG_REPORT_EXAMPLES.submission },
  })
  async submitReport(
    @Body() body: CreateBugReportDto,
    @Headers('user-agent') userAgentHeader?: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const submission = await this.bugReportService.submitReport(
      body,
      actor,
      (userAgentHeader ?? 'unknown').slice(0, MAX_BUG_REPORT_USER_AGENT_LENGTH),
    );

    return { data: submission };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
