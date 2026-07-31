import { Module } from '@nestjs/common';

import { AiProviderController } from './controller/ai-provider.controller';
import { AiProviderHttpClient } from './infrastructure/ai-provider-http.client';
import { AiProviderRegistry } from './infrastructure/providers/ai-provider-registry.service';
import { AnthropicAdapter } from './infrastructure/providers/anthropic.adapter';
import { OpenAiCompatibleAdapter } from './infrastructure/providers/openai-compatible.adapter';
import { AiProviderConfigRepository } from './repository/ai-provider-config.repository';
import { ChatRepository } from './repository/chat.repository';
import { AiChatbotService } from './service/ai-chatbot.service';
import { AiProviderConfigService } from './service/ai-provider-config.service';
import { AiProviderResolverService } from './service/ai-provider-resolver.service';

/**
 * Feature module for the post-MVP AI chatbot (Phase 13). P13-T03 shipped the
 * skeleton and the persistence layer (provider-config CRUD behind the
 * encryption boundary, the ownership-filtered session/message store);
 * P13-T04 adds the multi-provider gateway — the resilient HTTP executor,
 * the OpenAI-compatible and Anthropic adapters, the kind→adapter registry,
 * and the resolver that turns the active config into a callable provider.
 * P13-T05 adds the admin provider API (the module's only HTTP surface so
 * far) and `AiChatbotService`, the exchange orchestration that the chat
 * controller (P13-T08) will expose once context enrichment (P13-T06) and
 * the safety guards (P13-T07) have landed. Repositories are exported for
 * the services of those tasks, never for other modules: cross-module access
 * goes through services.
 */
@Module({
  controllers: [AiProviderController],
  providers: [
    AiProviderConfigRepository,
    ChatRepository,
    AiProviderHttpClient,
    OpenAiCompatibleAdapter,
    AnthropicAdapter,
    AiProviderRegistry,
    AiProviderResolverService,
    AiProviderConfigService,
    AiChatbotService,
  ],
  exports: [AiProviderConfigRepository, ChatRepository, AiChatbotService],
})
export class AiChatbotModule {}
