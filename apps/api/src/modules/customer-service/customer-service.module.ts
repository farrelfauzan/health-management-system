import { forwardRef, Module } from '@nestjs/common';

import { AiChatbotModule } from '../ai-chatbot/ai-chatbot.module';
import { ChannelGatewayModule } from '../channel-gateway/channel-gateway.module';
import { InboundMessageSink } from '../channel-gateway/service/inbound-message-sink.service';
import { ConversationRepository } from './repository/conversation.repository';
import { ConversationService } from './service/conversation.service';
import { CsSafetyPolicyService } from './service/cs-safety-policy.service';
import { HandoffService } from './service/handoff.service';
import { IntentOrchestratorService } from './service/intent-orchestrator.service';

/**
 * The conversational core of the WhatsApp/Telegram channel (`PCS-T06`,
 * strategy §4.2): conversation state, transcript, orchestration, and the
 * safety layer.
 *
 * **This module is what makes `PCS-T05`'s seam pay off.** It rebinds
 * `InboundMessageSink` to `ConversationService`, and not one line of the
 * gateway changes — the webhook still normalizes, dedups, and hands off, and
 * has no idea a state machine now exists behind it. The binding is here
 * rather than in `ChannelGatewayModule` on purpose: the dependency runs one
 * way, from the thinking half to the dumb pipe, and reversing it would put
 * business logic in the edge.
 *
 * `AiChatbotModule` is imported for `AiProviderResolverService` — the
 * clinic's one configured provider and its encrypted key serve web chat and
 * this channel alike (§6), and a second provider stack for the same clinic
 * would be a second place to rotate a key and a second thing to forget.
 */
@Module({
  // `forwardRef` because the relationship genuinely runs both ways and
  // pretending otherwise would be the lie: inbound messages come *from* the
  // gateway, replies go back *through* it. Nest resolves providers per module,
  // so binding the sink here without this would leave the gateway's normalizer
  // still holding whatever its own module bound — the override would compile,
  // load, and silently do nothing.
  imports: [forwardRef(() => ChannelGatewayModule), AiChatbotModule],
  providers: [
    ConversationRepository,
    CsSafetyPolicyService,
    IntentOrchestratorService,
    HandoffService,
    ConversationService,
    {
      provide: InboundMessageSink,
      useExisting: ConversationService,
    },
  ],
  exports: [ConversationRepository, HandoffService, InboundMessageSink],
})
export class CustomerServiceModule {}
