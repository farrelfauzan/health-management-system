import { Body, Controller, Get, Patch, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { TAXES_EXAMPLES } from '../../../common/openapi/taxes-examples';
import { UpdateTaxSettingsDto } from '../dto/update-tax-settings.dto';
import { TaxSettingsService } from '../service/tax-settings.service';

/**
 * Who the clinic is as a taxpayer (P27-T02, `docs/post-mvp/decisions.md` D-038).
 *
 * Stored with an actor and a timestamp rather than configured, because every
 * later tax computation reads it and a monthly draft is only explainable
 * against the profile that was in force when it was made.
 */
@ApiTags('Tax Settings')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/settings' })
export class TaxSettingsController {
  constructor(private readonly taxSettingsService: TaxSettingsService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'TaxSettings' }])
  @ApiEndpoint({
    summary: "Read the clinic's tax profile",
    responseDescription:
      "A clinic that has never saved it reads the defaults: general regime, not PKP, no taxpayer type. Prices are always tax-inclusive, so there is no pricing-mode field. The NPWP is the clinic profile's, shown here with `npwpStatus` so a 15-digit identifier from before Coretax is visible; `pp55LastEligibleYear` is computed from PP 55/2022 as amended by PP 20/2026.",
    responseExample: { data: TAXES_EXAMPLES.taxSettings.view },
  })
  async getTaxSettings() {
    return { data: await this.taxSettingsService.getTaxSettingsView() };
  }

  @Patch()
  @Auth([{ action: 'write', subject: 'TaxSettings' }])
  @ApiEndpoint({
    summary: "Change the clinic's tax profile",
    responseDescription:
      "Names any subset of fields; the rest stay as they were. Judged on the merged result: `TAX_PP55_NOT_ELIGIBLE` when the legal form cannot hold the 0.5% regime (a yayasan, a PT or CV starting after 2026, a period that has ended), `TAX_PKP_SINCE_REQUIRED` for a PKP without a registration date, `TAX_NITKU_NPWP_MISMATCH` when the NITKU does not begin with the clinic's 16-digit NPWP. Every change is audited as `TAX_SETTINGS_UPDATED` with old and new values.",
    responseExample: {
      data: TAXES_EXAMPLES.taxSettings.view,
      message: 'Tax settings updated',
    },
    requestType: UpdateTaxSettingsDto,
    requestExample: TAXES_EXAMPLES.taxSettings.updateRequest,
  })
  async updateTaxSettings(
    @Body() payload: UpdateTaxSettingsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.taxSettingsService.updateTaxSettings(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Tax settings updated',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
