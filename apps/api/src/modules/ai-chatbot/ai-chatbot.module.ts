import { Module } from '@nestjs/common';

import { AppointmentManagementModule } from '../appointment-management/appointment-management.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { PatientManagementModule } from '../patient-management/patient-management.module';
import { PharmacyFlowModule } from '../pharmacy-flow/pharmacy-flow.module';
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
import { ChatRetrievalService } from './service/chat-retrieval.service';
import { SafetyPolicyService } from './service/safety-policy.service';
import { ChatToolRegistrarService } from './tools/chat-tool-registrar.service';
import { ChatToolRegistry } from './tools/chat-tool.registry';
import { CheckMedicationExpiryTool } from './tools/definitions/check-medication-expiry.tool';
import { CheckMedicationStockTool } from './tools/definitions/check-medication-stock.tool';
import { GetPatientSummaryTool } from './tools/definitions/get-patient-summary.tool';
import { ListMyAppointmentsTool } from './tools/definitions/list-my-appointments.tool';
import { ListMyPatientsTool } from './tools/definitions/list-my-patients.tool';

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
 * modules: cross-module access goes through services. P15-T02 adds
 * `ChatToolRegistry`, the ability-filtered tool catalogue, and P15-T05 fills
 * it with the two pharmacy tools — which is why `PharmacyFlowModule` joins
 * the imported domain modules. Registration runs through
 * `ChatToolRegistrarService` behind `AI_CHAT_TOOLS_ENABLED`: with the flag
 * off the registry stays empty and the wire request is byte-identical to
 * Phase 13. P15-T11 adds `ChatRetrievalService` and with it
 * `DocumentManagementModule` — the retrieval mechanics stay in the document
 * store that owns the corpus, and this module only decides whether an
 * exchange uses them (`AI_CHAT_RETRIEVAL_ENABLED`, default off) and how the
 * passages and citations are shaped for the exchange.
 */
@Module({
  imports: [
    AuthModule,
    PatientManagementModule,
    AppointmentManagementModule,
    RegistrationFlowModule,
    PharmacyFlowModule,
    DocumentManagementModule,
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
    ChatRetrievalService,
    SafetyPolicyService,
    ChatToolRegistry,
    CheckMedicationStockTool,
    CheckMedicationExpiryTool,
    ListMyPatientsTool,
    GetPatientSummaryTool,
    ListMyAppointmentsTool,
    ChatToolRegistrarService,
    AiChatbotService,
  ],
  exports: [AiProviderConfigRepository, ChatRepository, AiChatbotService],
})
export class AiChatbotModule {}
