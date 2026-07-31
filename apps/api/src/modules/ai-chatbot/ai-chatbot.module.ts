import { Module } from '@nestjs/common';

import { AiProviderHttpClient } from './infrastructure/ai-provider-http.client';
import { AiProviderRegistry } from './infrastructure/providers/ai-provider-registry.service';
import { AnthropicAdapter } from './infrastructure/providers/anthropic.adapter';
import { OpenAiCompatibleAdapter } from './infrastructure/providers/openai-compatible.adapter';
import { AiProviderConfigRepository } from './repository/ai-provider-config.repository';
import { ChatRepository } from './repository/chat.repository';
import { AiProviderResolverService } from './service/ai-provider-resolver.service';

/**
 * Feature module for the post-MVP AI chatbot (Phase 13). P13-T03 shipped the
 * skeleton and the persistence layer (provider-config CRUD behind the
 * encryption boundary, the ownership-filtered session/message store);
 * P13-T04 adds the multi-provider gateway — the resilient HTTP executor,
 * the OpenAI-compatible and Anthropic adapters, the kind→adapter registry,
 * and the resolver that turns the active config into a callable provider.
 * The orchestration and admin services (P13-T05) and the chat controller
 * (P13-T08) still land here. Repositories are exported for the services of
 * those tasks, never for other modules: cross-module access goes through
 * services.
 */
@Module({
  providers: [
    AiProviderConfigRepository,
    ChatRepository,
    AiProviderHttpClient,
    OpenAiCompatibleAdapter,
    AnthropicAdapter,
    AiProviderRegistry,
    AiProviderResolverService,
  ],
  exports: [AiProviderConfigRepository, ChatRepository],
})
export class AiChatbotModule {}
