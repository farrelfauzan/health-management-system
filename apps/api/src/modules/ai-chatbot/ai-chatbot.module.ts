import { Module } from '@nestjs/common';

import { AiProviderConfigRepository } from './repository/ai-provider-config.repository';
import { ChatRepository } from './repository/chat.repository';

/**
 * Feature module for the post-MVP AI chatbot (Phase 13). P13-T03 ships the
 * skeleton and the persistence layer: provider-config CRUD behind the
 * encryption boundary and the ownership-filtered session/message store.
 * Providers accumulate task by task — the adapter/registry/resolver layer
 * (P13-T04), the orchestration and admin services (P13-T05), and the chat
 * controller (P13-T08) all register here. Repositories are exported for the
 * services of those tasks, never for other modules: cross-module access goes
 * through services.
 */
@Module({
  providers: [AiProviderConfigRepository, ChatRepository],
  exports: [AiProviderConfigRepository, ChatRepository],
})
export class AiChatbotModule {}
