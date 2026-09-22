import { Body, Controller, Get, Post, Put, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_NON_CAPITATION_EXAMPLES } from '../../../common/openapi/bpjs-non-capitation-examples';
import { CreateNonCapitationTariffDto } from '../dto/create-non-capitation-tariff.dto';
import { UpdateNonCapitationSettingsDto } from '../dto/update-non-capitation-settings.dto';
import { BpjsNonCapitationSettingsService } from '../service/bpjs-non-capitation-settings.service';

const HTTP_CREATED = 201;

/**
 * The induk FKTP settings and the tariff table of the non-capitation recap
 * (P25-T16, D-043). Everything Q12 will answer is a setting here: the induk's
 * code and name, whether it is government-owned, whether the PMB keys eClaim
 * itself, and the filing day of the month.
 */
@ApiTags('BPJS Non-Capitation')
@RequireFeature('bpjs-pcare')
@Controller({ version: '1', path: 'bpjs/non-capitation' })
export class BpjsNonCapitationSettingsController {
  constructor(private readonly settingsService: BpjsNonCapitationSettingsService) {}

  @Get('settings')
  @Auth([{ action: 'read', subject: 'BpjsNonCapitation' }])
  @ApiEndpoint({
    summary: 'Read the induk FKTP settings',
    responseDescription:
      'The induk FKTP the recap is addressed to and its filing day. Before anything is saved every field is null except the filing day, which defaults to the 10th (Permenkes 28/2014 lampiran p. 31).',
    responseExample: { data: BPJS_NON_CAPITATION_EXAMPLES.settingsView },
  })
  async getSettings() {
    return { data: await this.settingsService.getSettings() };
  }

  @Put('settings')
  @Auth([{ action: 'write', subject: 'BpjsNonCapitation' }])
  @ApiEndpoint({
    summary: 'Save the induk FKTP settings',
    responseDescription:
      'The saved settings. `null` keeps a field unknown. The filing day is 1–28. Audited as NON_CAPITATION_SETTINGS_CHANGED.',
    responseExample: { data: BPJS_NON_CAPITATION_EXAMPLES.settingsView },
    requestType: UpdateNonCapitationSettingsDto,
    requestExample: BPJS_NON_CAPITATION_EXAMPLES.updateSettingsRequest,
  })
  async updateSettings(
    @Body() body: UpdateNonCapitationSettingsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.settingsService.updateSettings(body, this.assertAuthenticated(currentUser)),
    };
  }

  @Get('tariffs')
  @Auth([{ action: 'read', subject: 'BpjsNonCapitation' }])
  @ApiEndpoint({
    summary: 'List the non-capitation tariffs',
    responseDescription:
      'Every tariff row by service type and validity window, with its regulation reference. Seeded from Permenkes 3/2023 Pasal 19–22, pp. 13–16.',
    responseExample: { data: [BPJS_NON_CAPITATION_EXAMPLES.tariffView] },
  })
  async listTariffs() {
    return { data: await this.settingsService.listTariffs() };
  }

  @Post('tariffs')
  @Auth([{ action: 'write', subject: 'BpjsNonCapitation' }])
  @ApiEndpoint({
    summary: 'Add a non-capitation tariff from a date',
    responseDescription:
      'The new row. The open row of the same service type is closed the day before `validFrom`. 409 NON_CAPITATION_TARIFF_OVERLAP when a row of the type already starts on or after that date. Audited as NON_CAPITATION_TARIFF_CHANGED.',
    responseExample: { data: BPJS_NON_CAPITATION_EXAMPLES.tariffView },
    requestType: CreateNonCapitationTariffDto,
    requestExample: BPJS_NON_CAPITATION_EXAMPLES.createTariffRequest,
    successStatus: HTTP_CREATED,
  })
  async createTariff(
    @Body() body: CreateNonCapitationTariffDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.settingsService.createTariff(body, this.assertAuthenticated(currentUser)),
    };
  }

  private assertAuthenticated(currentUser: CurrentUser | undefined): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
