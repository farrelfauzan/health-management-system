import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_ANTREAN_EXAMPLES } from '../../../common/openapi/bpjs-antrean-examples';
import { UpsertBpjsAntreanConfigDto } from '../dto/upsert-bpjs-antrean-config.dto';
import { BpjsAntreanConfigService } from '../service/bpjs-antrean-config.service';

@ApiTags('BPJS Antrean')
@Controller({
  version: '1',
  path: 'bpjs/antrean',
})
export class BpjsAntreanConfigController {
  constructor(private readonly configService: BpjsAntreanConfigService) {}

  @Get('config')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Read the BPJS Antrean Online bridging configuration',
    responseDescription:
      'The stored configuration with masked credentials. Secrets are write-only: only presence flags and last-4 display values are ever returned. The inbound username is shown in full because it is not a secret.',
    responseExample: { data: BPJS_ANTREAN_EXAMPLES.configView },
    notFoundDescription: 'BPJS Antrean is not configured.',
  })
  async getConfig(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.configService.getConfig();

    return { data: view };
  }

  @Put('config')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Create or replace the BPJS Antrean Online bridging configuration',
    responseDescription:
      'The saved configuration with masked credentials. These are the Antrean service’s own credentials — separately issued and separately revoked from the PCare set, so saving them neither affects nor requires PCare bridging. On first save both outbound secrets are required; afterwards an omitted secret keeps its stored value. The inbound username and password are the pair BPJS presents to the facility’s token endpoint and are agreed at UAT, so they stay optional.',
    responseExample: {
      data: BPJS_ANTREAN_EXAMPLES.configView,
      message: 'BPJS Antrean configuration saved',
    },
    requestType: UpsertBpjsAntreanConfigDto,
    requestExample: BPJS_ANTREAN_EXAMPLES.upsertRequest,
  })
  async upsertConfig(
    @Body() body: UpsertBpjsAntreanConfigDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.configService.upsertConfig(body, actor);

    return {
      data: result.view,
      message: result.wasCreated
        ? 'BPJS Antrean configuration created'
        : 'BPJS Antrean configuration updated',
    };
  }

  @Delete('config')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Delete the BPJS Antrean Online bridging configuration',
    responseDescription:
      'The stored Antrean credentials were removed. Antrean bridging stops until a new configuration is saved; PCare bridging is unaffected.',
    responseExample: {
      data: BPJS_ANTREAN_EXAMPLES.deletedConfig,
      message: 'BPJS Antrean configuration deleted',
    },
    notFoundDescription: 'BPJS Antrean is not configured.',
  })
  async deleteConfig(@AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.configService.deleteConfig(actor);

    return {
      data: result,
      message: 'BPJS Antrean configuration deleted',
    };
  }

  @Post('config/test-connection')
  @HttpCode(200)
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Test the stored BPJS Antrean credentials',
    responseDescription:
      'Calls the side-effect-free HFIS poli reference read and reports signature validity, credential acceptance, and response decryption. A failed test is a 200 with isSuccessful=false and the readable reason — the outcome is also persisted on the configuration.',
    responseExample: { data: BPJS_ANTREAN_EXAMPLES.connectionTestResult },
    notFoundDescription: 'BPJS Antrean is not configured.',
  })
  async testConnection(@AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.configService.testConnection(actor);

    return { data: result };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
