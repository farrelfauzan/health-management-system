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

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SATUSEHAT_EXAMPLES } from '../../../common/openapi/satusehat-examples';
import { LinkDoctorByIhsDto } from '../dto/link-doctor-by-ihs.dto';
import { SatusehatLinkService } from '../service/satusehat-link.service';

@ApiTags('SATUSEHAT')
@RequireFeature('satusehat')
@Controller({
  version: '1',
  path: 'satusehat',
})
export class SatusehatLinkController {
  constructor(private readonly satusehatLinkService: SatusehatLinkService) {}

  @Post('patients/:patientId/link')
  @HttpCode(200)
  @Auth([{ action: 'link', subject: 'Satusehat' }])
  @ApiEndpoint({
    summary: 'Link a patient to their SATUSEHAT IHS number',
    responseDescription:
      'The patient was resolved on the SATUSEHAT master patient index by NIK and the IHS number was stored encrypted. Idempotent: an already linked patient returns its current state without an upstream call.',
    responseExample: { data: SATUSEHAT_EXAMPLES.patientLink },
    notFoundDescription: 'Patient not found, or no SATUSEHAT record matches the stored NIK.',
  })
  async linkPatient(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.satusehatLinkService.linkPatient(patientId, actor);

    return {
      data: result,
    };
  }

  @Post('doctors/:doctorId/link')
  @HttpCode(200)
  @Auth([{ action: 'link', subject: 'Satusehat' }])
  @ApiEndpoint({
    summary: 'Link a doctor to their SATUSEHAT IHS practitioner number',
    responseDescription:
      'The practitioner was resolved on the SATUSEHAT index by NIK and the IHS number was stored. Idempotent: an already linked doctor returns its current state without an upstream call.',
    responseExample: { data: SATUSEHAT_EXAMPLES.doctorLink },
    notFoundDescription: 'Doctor not found, or no SATUSEHAT record matches the stored NIK.',
  })
  async linkDoctor(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.satusehatLinkService.linkDoctor(doctorId, actor);

    return {
      data: result,
    };
  }

  @Post('doctors/:doctorId/link-by-ihs/preview')
  @HttpCode(200)
  @Auth([{ action: 'link', subject: 'Satusehat' }])
  @ApiEndpoint({
    summary: 'Preview linking a doctor to a hand-typed SATUSEHAT IHS number',
    responseDescription:
      "Reads GET /Practitioner/:id and returns what SATUSEHAT holds beside our record, saving nothing (P21-T08). This is for a doctor whose NIK matches several SATUSEHAT records. The platform returns no gender or birth date and masks the NIK to its last three digits, so the preview is the SATUSEHAT name beside ours plus `nikSuffixCheck`: MATCHES, DIFFERS (a different person) or UNAVAILABLE. A doctor already linked to a different IHS number gets 409.",
    requestType: LinkDoctorByIhsDto,
    requestExample: SATUSEHAT_EXAMPLES.doctorIhsLinkRequest,
    responseExample: { data: SATUSEHAT_EXAMPLES.doctorIhsPreview },
    notFoundDescription: 'Doctor not found, or SATUSEHAT holds no practitioner with this IHS number.',
  })
  async previewDoctorIhsLink(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Body() body: LinkDoctorByIhsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const preview = await this.satusehatLinkService.previewDoctorIhsLink(
      doctorId,
      body.ihsNumber,
      actor,
    );

    return {
      data: preview,
    };
  }

  @Post('doctors/:doctorId/link-by-ihs')
  @HttpCode(200)
  @Auth([{ action: 'link', subject: 'Satusehat' }])
  @ApiEndpoint({
    summary: 'Link a doctor to a hand-typed SATUSEHAT IHS number after confirmation',
    responseDescription:
      "Reads the IHS number back from SATUSEHAT again rather than trusting the preview, then stores it and audits SATUSEHAT_DOCTOR_LINKED with lookup IHS_MANUAL (P21-T08). Refused with 404 when SATUSEHAT does not hold the id, and 409 when the visible NIK digits prove a different practitioner or the doctor is already linked to a different id. Idempotent for the id the doctor already holds.",
    requestType: LinkDoctorByIhsDto,
    requestExample: SATUSEHAT_EXAMPLES.doctorIhsLinkRequest,
    responseExample: { data: SATUSEHAT_EXAMPLES.doctorIhsLink },
    notFoundDescription: 'Doctor not found, or SATUSEHAT holds no practitioner with this IHS number.',
  })
  async linkDoctorByIhs(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Body() body: LinkDoctorByIhsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.satusehatLinkService.linkDoctorByIhs(doctorId, body.ihsNumber, actor);

    return {
      data: result,
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
