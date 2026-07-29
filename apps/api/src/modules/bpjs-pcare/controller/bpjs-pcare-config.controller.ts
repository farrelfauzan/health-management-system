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
import { BPJS_PCARE_EXAMPLES } from '../../../common/openapi/bpjs-pcare-examples';
import { UpsertBpjsPcareConfigDto } from '../dto/upsert-bpjs-pcare-config.dto';
import { BpjsPcareConfigService } from '../service/bpjs-pcare-config.service';

@ApiTags('BPJS PCare')
@Controller({
  version: '1',
  path: 'bpjs',
})
export class BpjsPcareConfigController {
  constructor(private readonly configService: BpjsPcareConfigService) {}

  @Get('config')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Read the BPJS PCare bridging configuration',
    responseDescription:
      'The stored configuration with masked credentials. Secrets are write-only: only presence flags and last-4 display values are ever returned.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.configView },
    notFoundDescription: 'BPJS PCare is not configured.',
  })
  async getConfig(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.configService.getConfig();

    return { data: view };
  }

  @Put('config')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Create or replace the BPJS PCare bridging configuration',
    responseDescription:
      'The saved configuration with masked credentials. On first save all three secrets are required; afterwards an omitted secret keeps its stored value. The stored PCare login is the clinic’s real web-app login — HMS will use it to create and delete claims on the clinic’s behalf.',
    responseExample: {
      data: BPJS_PCARE_EXAMPLES.configView,
      message: 'BPJS PCare configuration saved',
    },
    requestType: UpsertBpjsPcareConfigDto,
    requestExample: BPJS_PCARE_EXAMPLES.upsertRequest,
  })
  async upsertConfig(
    @Body() body: UpsertBpjsPcareConfigDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.configService.upsertConfig(body, actor);

    return {
      data: result.view,
      message: result.wasCreated
        ? 'BPJS PCare configuration created'
        : 'BPJS PCare configuration updated',
    };
  }

  @Delete('config')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Delete the BPJS PCare bridging configuration',
    responseDescription:
      'The stored credentials were removed. Bridging stops until a new configuration is saved.',
    responseExample: {
      data: BPJS_PCARE_EXAMPLES.deletedConfig,
      message: 'BPJS PCare configuration deleted',
    },
    notFoundDescription: 'BPJS PCare is not configured.',
  })
  async deleteConfig(@AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.configService.deleteConfig(actor);

    return {
      data: result,
      message: 'BPJS PCare configuration deleted',
    };
  }

  @Post('config/test-connection')
  @HttpCode(200)
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Test the stored BPJS PCare credentials',
    responseDescription:
      'Calls the harmless poli reference read and reports signature validity, credential acceptance, and response decryption. A failed test is a 200 with isSuccessful=false and the readable reason — the outcome is also persisted on the configuration.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.connectionTestResult },
    notFoundDescription: 'BPJS PCare is not configured.',
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
