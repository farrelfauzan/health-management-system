import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SATUSEHAT_EXAMPLES } from '../../../common/openapi/satusehat-examples';
import { SatusehatLinkService } from '../service/satusehat-link.service';

@ApiTags('SATUSEHAT')
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

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
