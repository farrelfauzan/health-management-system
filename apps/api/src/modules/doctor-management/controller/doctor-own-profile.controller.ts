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
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CompleteOwnDoctorProfileDto } from '../dto/complete-own-doctor-profile.dto';
import { UpdateOwnDoctorProfileDto } from '../dto/update-own-doctor-profile.dto';
import { DoctorOwnProfileService } from '../service/doctor-own-profile.service';
import { DoctorProfileCompletionService } from '../service/doctor-profile-completion.service';

/**
 * The signed-in doctor's own profile (P20-T03).
 *
 * Its own `me/doctor-profile` prefix rather than `doctors/me`: the doctor
 * controller already owns `GET doctors/:id` behind a UUID pipe, and a literal
 * segment under that prefix would race it on registration order.
 */
@ApiTags('Doctor Management')
@Controller({
  version: '1',
  path: 'me/doctor-profile',
})
export class DoctorOwnProfileController {
  constructor(
    private readonly doctorOwnProfileService: DoctorOwnProfileService,
    private readonly doctorProfileCompletionService: DoctorProfileCompletionService,
  ) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'Get my doctor profile',
    responseDescription:
      'The doctor profile linked to the signed-in account, in the doctor detail shape. 404 when the account has no doctor profile.',
    responseExample: { data: PHASE_THREE_EXAMPLES.doctor.detail },
    notFoundDescription: 'No doctor profile is linked to this account.',
  })
  async getOwnDoctorProfile(@AuthUser() currentUser?: CurrentUser) {
    return {
      data: await this.doctorOwnProfileService.getOwnDoctorProfile(
        this.assertAuthenticated(currentUser),
      ),
    };
  }

  @Patch()
  @Auth([{ action: 'update', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'Update my doctor profile',
    responseDescription:
      'Changes the fields a doctor owns — name, title, degrees, phone and education. Specialty, licences, NIK, the SATUSEHAT practitioner id and status are administrative and are refused with 400 (see D-025).',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.doctor.detail,
      message: 'Profile updated',
    },
    requestType: UpdateOwnDoctorProfileDto,
    requestExample: PHASE_THREE_EXAMPLES.doctor.updateOwnRequest,
    notFoundDescription: 'No doctor profile is linked to this account.',
  })
  async updateOwnDoctorProfile(
    @Body() payload: UpdateOwnDoctorProfileDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorOwnProfileService.updateOwnDoctorProfile(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Profile updated',
    };
  }

  @Post('completion')
  @HttpCode(200)
  @Auth([{ action: 'update', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'Complete my doctor profile',
    responseDescription:
      'The profile-completion screen (P20-T02, D-026). With no doctor profile yet, creates one owned by the signed-in doctor — specialty, STR number and NIK are then required. With a profile the clinic started, fills only what is still empty; a specialty, STR number or NIK already on file is refused with 409 rather than overwritten. Doctors only. Refresh the session afterwards: the profile-completion flag in the session hint is only rewritten at issuance.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.doctor.detail,
      message: 'Profile completed',
    },
    requestType: CompleteOwnDoctorProfileDto,
    requestExample: PHASE_THREE_EXAMPLES.doctor.completeOwnRequest,
  })
  async completeOwnDoctorProfile(
    @Body() payload: CompleteOwnDoctorProfileDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorProfileCompletionService.completeOwnDoctorProfile(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Profile completed',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
