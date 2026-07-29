import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_PCARE_EXAMPLES } from '../../../common/openapi/bpjs-pcare-examples';
import { CheckBpjsEligibilityDto } from '../dto/check-bpjs-eligibility.dto';
import { BpjsEligibilityService } from '../service/bpjs-eligibility.service';

@ApiTags('BPJS PCare')
@Controller({
  version: '1',
  path: 'bpjs/eligibility',
})
export class BpjsEligibilityController {
  constructor(private readonly eligibilityService: BpjsEligibilityService) {}

  @Post('patients/:patientId/check')
  @HttpCode(200)
  @Auth([{ action: 'check', subject: 'BpjsEligibility' }])
  @ApiEndpoint({
    summary: 'Check a patient’s BPJS eligibility (peserta)',
    responseDescription:
      'The membership state for the eligibility card: ACTIVE, INACTIVE (with BPJS’s readable reason), NOT_FOUND, or UNREACHABLE when PCare cannot be contacted — still a 200, because registration must never block on BPJS. Results are cached per patient per clinic-local day; pass force to bypass the cache after correcting patient data. Looks up by the stored BPJS number, falling back to NIK.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.eligibilityActiveResult },
    requestType: CheckBpjsEligibilityDto,
    requestExample: BPJS_PCARE_EXAMPLES.eligibilityCheckRequest,
    notFoundDescription: 'Patient not found, or BPJS PCare is not configured.',
  })
  async checkEligibility(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Body() body: CheckBpjsEligibilityDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.eligibilityService.checkEligibility(patientId, body, actor);

    return { data: result };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
