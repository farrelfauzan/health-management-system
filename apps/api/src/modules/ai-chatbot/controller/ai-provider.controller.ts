import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { AI_CHATBOT_EXAMPLES } from '../../../common/openapi/ai-chatbot-examples';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CreateAiProviderConfigDto } from '../dto/create-ai-provider-config.dto';
import { UpdateAiProviderConfigDto } from '../dto/update-ai-provider-config.dto';
import { AiProviderConfigService } from '../service/ai-provider-config.service';

@ApiTags('AI Chatbot')
@Controller({
  version: '1',
  path: 'admin/ai-providers',
})
export class AiProviderController {
  constructor(private readonly configService: AiProviderConfigService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'AiProviderConfig' }])
  @ApiEndpoint({
    summary: 'List the clinic’s AI provider configurations',
    responseDescription:
      'All live configurations, newest first, with the active one flagged. API keys are write-only: only a presence flag and the four-character hint are ever returned.',
    responseExample: {
      data: [AI_CHATBOT_EXAMPLES.configView, AI_CHATBOT_EXAMPLES.stagedConfigView],
    },
  })
  async listConfigs(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const views = await this.configService.listConfigs();

    return { data: views };
  }

  @Post()
  @Auth([{ action: 'write', subject: 'AiProviderConfig' }])
  @ApiEndpoint({
    summary: 'Create an AI provider configuration',
    responseDescription:
      'The created configuration, always staged inactive — activating it is a separate call, which is how a clinic cuts over between providers without a gap. An API key is required for every kind except OLLAMA, and an explicit base URL for OPENAI_COMPATIBLE and AZURE_OPENAI.',
    responseExample: {
      data: AI_CHATBOT_EXAMPLES.stagedConfigView,
      message: 'AI provider configuration created',
    },
    requestType: CreateAiProviderConfigDto,
    requestExample: AI_CHATBOT_EXAMPLES.createRequest,
    successStatus: 201,
  })
  async createConfig(
    @Body() body: CreateAiProviderConfigDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.configService.createConfig(body, actor);

    return { data: view, message: 'AI provider configuration created' };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'AiProviderConfig' }])
  @ApiEndpoint({
    summary: 'Update an AI provider configuration',
    responseDescription:
      'The updated configuration. An omitted apiKey keeps the stored key — write-only secrets are never echoed back for re-submission; sending a new one rotates it. A null baseUrl clears the override back to the vendor default, which is refused for kinds that have none.',
    responseExample: {
      data: AI_CHATBOT_EXAMPLES.configView,
      message: 'AI provider configuration updated',
    },
    requestType: UpdateAiProviderConfigDto,
    requestExample: AI_CHATBOT_EXAMPLES.updateRequest,
    notFoundDescription: 'AI provider configuration not found.',
  })
  async updateConfig(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAiProviderConfigDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.configService.updateConfig(id, body, actor);

    return { data: view, message: 'AI provider configuration updated' };
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'AiProviderConfig' }])
  @ApiEndpoint({
    summary: 'Route chat traffic to an AI provider configuration',
    responseDescription:
      'Releases the current active configuration and claims the slot in one transaction, so no request ever sees two providers or none. A configuration that would fail resolution (missing key or base URL for its kind) is refused here rather than at the next patient message. Existing sessions keep their recorded provider metadata.',
    responseExample: {
      data: AI_CHATBOT_EXAMPLES.configView,
      message: 'AI provider configuration activated',
    },
    notFoundDescription: 'AI provider configuration not found.',
  })
  async activateConfig(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.configService.activateConfig(id, actor);

    return { data: view, message: 'AI provider configuration activated' };
  }

  @Post(':id/test')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'AiProviderConfig' }])
  @ApiEndpoint({
    summary: 'Test the stored AI provider credentials',
    responseDescription:
      'Sends a minimal completion through the real adapter path to prove the key, base URL, and model together. No chat session is created. A failed test is a 200 with isSuccessful=false and the provider’s readable reason — the outcome is also persisted on the configuration. Only the active configuration can be tested, because that is the one a patient message would use.',
    responseExample: { data: AI_CHATBOT_EXAMPLES.connectionTestResult },
    notFoundDescription: 'AI provider configuration not found.',
  })
  async testConnection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.configService.testConnection(id, actor);

    return { data: result };
  }

  @Delete(':id')
  @Auth([{ action: 'write', subject: 'AiProviderConfig' }])
  @ApiEndpoint({
    summary: 'Retire an AI provider configuration',
    responseDescription:
      'Soft-deletes the configuration and releases the active slot in the same write. The active configuration is refused: deleting it would leave chat with no provider, so activate a replacement first.',
    responseExample: {
      data: AI_CHATBOT_EXAMPLES.deletedConfig,
      message: 'AI provider configuration deleted',
    },
    notFoundDescription: 'AI provider configuration not found.',
  })
  async deleteConfig(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.configService.deleteConfig(id, actor);

    return { data: result, message: 'AI provider configuration deleted' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
