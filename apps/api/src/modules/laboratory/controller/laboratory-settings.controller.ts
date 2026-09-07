import { Body, Controller, Get, Patch, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { UpdateLaboratorySettingsDto } from '../dto/update-laboratory-settings.dto';
import { LaboratorySettingsService } from '../service/laboratory-settings.service';

/**
 * How this clinic runs its bench (`P18-T04`).
 *
 * Two switches, and both loosen a safety rule, which is why they are a stored
 * row with an actor and a timestamp rather than deployment configuration: who
 * may sign a result out is a governance choice a clinic makes and may later be
 * asked to justify.
 */
@ApiTags('Laboratory Settings')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'laboratory/settings' })
export class LaboratorySettingsController {
  constructor(private readonly laboratorySettingsService: LaboratorySettingsService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'LaboratorySettings' }])
  @ApiEndpoint({
    summary: 'Read the laboratory verification settings',
    responseDescription:
      'Both flags default to the strict posture, and a clinic that has never touched them reads the same defaults: two different people sign a result out, and a technician is not one of them.',
    responseExample: { data: LABORATORY_EXAMPLES.laboratorySettings.view },
  })
  async getLaboratorySettings() {
    return { data: await this.laboratorySettingsService.getLaboratorySettingsView() };
  }

  @Patch()
  @Auth([{ action: 'write', subject: 'LaboratorySettings' }])
  @Audited({ resource: 'laboratory-settings', action: AuditAction.UPDATE, idParam: null })
  @ApiEndpoint({
    summary: 'Change the laboratory verification settings',
    responseDescription:
      'Names one flag or both; whatever is not named is left exactly as it was, so turning one on never quietly turns the other on with it. The change is audited with both the old and the new value — a released result records which rules were in force when it was signed, and this is the other half of that record.',
    responseExample: {
      data: { ...LABORATORY_EXAMPLES.laboratorySettings.view, technicianMayVerify: true },
      message: 'Laboratory settings updated',
    },
    requestType: UpdateLaboratorySettingsDto,
    requestExample: LABORATORY_EXAMPLES.laboratorySettings.updateRequest,
  })
  async updateLaboratorySettings(
    @Body() payload: UpdateLaboratorySettingsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.laboratorySettingsService.updateLaboratorySettings(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Laboratory settings updated',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
