import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CLINIC_PROFILE_EXAMPLES } from '../../../common/openapi/clinic-profile-examples';
import { CreateClinicLogoUploadUrlDto } from '../dto/create-clinic-logo-upload-url.dto';
import { UpdateClinicProfileDto } from '../dto/update-clinic-profile.dto';
import { ClinicProfileService } from '../service/clinic-profile.service';

/**
 * The clinic's own identity. Deliberately **not** behind `@RequireFeature`:
 * a clinic's name, address and licence number are not a module anyone buys,
 * and an entitlement that could switch them off would take the letterhead off
 * every document at once — including the ones a clinic that bought nothing
 * still prints.
 */
@ApiTags('Clinic Profile')
@Controller({
  version: '1',
  path: 'clinic-profile',
})
export class ClinicProfileController {
  constructor(private readonly clinicProfileService: ClinicProfileService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'ClinicProfile' }])
  @ApiEndpoint({
    summary: 'Read the clinic profile',
    responseDescription:
      'The clinic identity every printed document is headed with. `logoUrl` is a short-lived signed URL minted for this response — never store it.',
    responseExample: { data: CLINIC_PROFILE_EXAMPLES.profile },
    notFoundDescription: 'The clinic profile has not been configured yet.',
  })
  async getClinicProfile() {
    const profile = await this.clinicProfileService.getProfile();

    return { data: profile };
  }

  @Patch()
  @Auth([{ action: 'write', subject: 'ClinicProfile' }])
  @ApiEndpoint({
    summary: 'Create or update the clinic profile',
    responseDescription:
      'The saved profile. Omitted fields keep their stored value and an explicit null clears one; `name` is required on the first save. Passing `logoStorageKey` claims a staged upload — the bytes are re-encoded before anything is stored.',
    responseExample: {
      data: CLINIC_PROFILE_EXAMPLES.profile,
      message: 'Clinic profile updated',
    },
    requestType: UpdateClinicProfileDto,
    requestExample: CLINIC_PROFILE_EXAMPLES.updateRequest,
  })
  async updateClinicProfile(
    @Body() payload: UpdateClinicProfileDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const profile = await this.clinicProfileService.updateProfile(payload, actor);

    return {
      data: profile,
      message: 'Clinic profile updated',
    };
  }

  @Post('logo-upload-url')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'ClinicProfile' }])
  @ApiEndpoint({
    summary: 'Sign a browser-direct logo upload',
    responseDescription:
      'A short-lived signed PUT. Send `requiredHeaders` verbatim, then PATCH the profile with the returned `storageKey` to claim it — nothing is stored until you do.',
    responseExample: { data: CLINIC_PROFILE_EXAMPLES.logoUploadUrl },
    requestType: CreateClinicLogoUploadUrlDto,
    requestExample: CLINIC_PROFILE_EXAMPLES.logoUploadUrlRequest,
  })
  async createLogoUploadUrl(@Body() payload: CreateClinicLogoUploadUrlDto) {
    const upload = await this.clinicProfileService.createLogoUploadUrl(payload);

    return { data: upload };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
