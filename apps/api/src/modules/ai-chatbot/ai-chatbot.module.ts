import { Module } from '@nestjs/common';

import { AppointmentManagementModule } from '../appointment-management/appointment-management.module';
import { AuthModule } from '../auth/auth.module';
import { PatientManagementModule } from '../patient-management/patient-management.module';
import { RegistrationFlowModule } from '../registration-flow/registration-flow.module';
import { AiProviderController } from './controller/ai-provider.controller';
import { ChatController } from './controller/chat.controller';
import { AiProviderHttpClient } from './infrastructure/ai-provider-http.client';
import { AiProviderRegistry } from './infrastructure/providers/ai-provider-registry.service';
import { AnthropicAdapter } from './infrastructure/providers/anthropic.adapter';
import { OpenAiCompatibleAdapter } from './infrastructure/providers/openai-compatible.adapter';
import { AiProviderConfigRepository } from './repository/ai-provider-config.repository';
import { ChatRepository } from './repository/chat.repository';
import { AiChatbotService } from './service/ai-chatbot.service';
import { AiProviderConfigService } from './service/ai-provider-config.service';
import { AiProviderResolverService } from './service/ai-provider-resolver.service';
import { ChatContextEnrichmentService } from './service/chat-context-enrichment.service';
import { SafetyPolicyService } from './service/safety-policy.service';

/**
 * Feature module for the post-MVP AI chatbot (Phase 13). P13-T03 shipped the
 * skeleton and the persistence layer (provider-config CRUD behind the
 * encryption boundary, the ownership-filtered session/message store);
 * P13-T04 adds the multi-provider gateway — the resilient HTTP executor,
 * the OpenAI-compatible and Anthropic adapters, the kind→adapter registry,
 * and the resolver that turns the active config into a callable provider.
 * P13-T05 adds the admin provider API (the module's only HTTP surface so
 * far) and `AiChatbotService`, the exchange orchestration that the chat
 * controller (P13-T08) will expose once the safety guards (P13-T07) have
 * landed. P13-T06 adds the redacted context enrichment, which is why this
 * module imports three domain modules: their services are the only way the
 * chatbot reads clinical data — never a foreign repository — and calling
 * them as the authenticated user inherits their `:own` scoping. Repositories
 * are exported for the services of the remaining tasks, never for other
 * modules: cross-module access goes through services.
 */
@Module({
  imports: [
    AuthModule,
    PatientManagementModule,
    AppointmentManagementModule,
    RegistrationFlowModule,
  ],
  controllers: [AiProviderController, ChatController],
  providers: [
    AiProviderConfigRepository,
    ChatRepository,
    AiProviderHttpClient,
    OpenAiCompatibleAdapter,
    AnthropicAdapter,
    AiProviderRegistry,
    AiProviderResolverService,
    AiProviderConfigService,
    ChatContextEnrichmentService,
    SafetyPolicyService,
    AiChatbotService,
  ],
  exports: [AiProviderConfigRepository, ChatRepository, AiChatbotService],
})
export class AiChatbotModule {}
