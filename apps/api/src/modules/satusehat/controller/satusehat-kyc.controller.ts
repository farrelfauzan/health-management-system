import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SATUSEHAT_EXAMPLES } from '../../../common/openapi/satusehat-examples';
import { CreateSatusehatKycSessionDto } from '../dto/create-satusehat-kyc-session.dto';
import { SatusehatKycService } from '../service/satusehat-kyc.service';

/**
 * "Verifikasi SATUSEHAT" (P24-T16): the front desk verifies a patient's
 * SATUSEHAT Mobile profile from inside the EMR. No `@Audited` here — the
 * service writes `SATUSEHAT_KYC_STARTED` itself, because a failed request
 * must be audited too and the interceptor writes on success only.
 */
@ApiTags('SATUSEHAT')
@RequireFeature('satusehat')
@Controller({
  version: '1',
  path: 'satusehat/kyc',
})
export class SatusehatKycController {
  constructor(private readonly satusehatKycService: SatusehatKycService) {}

  @Get('status')
  @Auth([{ action: 'verify', subject: 'SatusehatKyc' }])
  @ApiEndpoint({
    summary: 'Whether I can start a SATUSEHAT KYC verification',
    responseDescription:
      'Enabled, or the one reason it is not: SATUSEHAT credentials absent, KYC key material absent or invalid, the KYC URL on a different platform than the FHIR URL, or the signed-in operator has no NIK or no name on file (FR-KYC-07). The rule is "KYC keys not configured", never "sandbox".',
    responseExample: { data: SATUSEHAT_EXAMPLES.kycStatus },
  })
  async getStatus(@AuthUser() currentUser?: CurrentUser) {
    return {
      data: await this.satusehatKycService.getStatus(this.assertAuthenticated(currentUser)),
    };
  }

  @Post('sessions')
  @HttpCode(201)
  @Auth([{ action: 'verify', subject: 'SatusehatKyc' }])
  @ApiEndpoint({
    summary: 'Start a SATUSEHAT KYC verification',
    responseDescription:
      "Asks the platform for a validation URL on the signed-in operator's behalf — their account name and NIK (clinician profile first, then account; D-039) travel inside SATUSEHAT's encrypted request. The URL is returned once and is never persisted or logged; open it in the dialog or a new tab. Audits SATUSEHAT_KYC_STARTED with the operator and, when given, the patient. 422 when the operator has no NIK or no name; 503 when SATUSEHAT or its KYC keys are not configured; 502 when the platform refused or is unreachable.",
    requestType: CreateSatusehatKycSessionDto,
    requestExample: { patientId: '4f1c2a9e-6b3d-4e8a-9c7f-1a2b3c4d5e6f' },
    responseExample: { data: SATUSEHAT_EXAMPLES.kycSession },
  })
  async startSession(
    @Body() payload: CreateSatusehatKycSessionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.satusehatKycService.startSession(
        payload,
        this.assertAuthenticated(currentUser),
      ),
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
