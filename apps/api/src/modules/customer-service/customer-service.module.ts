import { forwardRef, Module } from '@nestjs/common';

import { AiChatbotModule } from '../ai-chatbot/ai-chatbot.module';
import { AppointmentManagementModule } from '../appointment-management/appointment-management.module';
import { AuthModule } from '../auth/auth.module';
import { ChannelGatewayModule } from '../channel-gateway/channel-gateway.module';
import { InboundMessageSink } from '../channel-gateway/service/inbound-message-sink.service';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { PatientManagementModule } from '../patient-management/patient-management.module';
import { ChannelArrivalController } from './controller/channel-arrival.controller';
import { CsAdminController } from './controller/cs-admin.controller';
import { AdminConversationRepository } from './repository/admin-conversation.repository';
import { ChannelArrivalRepository } from './repository/channel-arrival.repository';
import { ChannelMetricsRepository } from './repository/channel-metrics.repository';
import { ChannelOtpChallengeRepository } from './repository/channel-otp-challenge.repository';
import { ChannelPatientLinkRepository } from './repository/channel-patient-link.repository';
import { ConversationRepository } from './repository/conversation.repository';
import { ChannelArrivalService } from './service/channel-arrival.service';
import { ChannelMetricsService } from './service/channel-metrics.service';
import { ChannelBookingService } from './service/channel-booking.service';
import { CsAdminService } from './service/cs-admin.service';
import { ChannelVerificationService } from './service/channel-verification.service';
import { ConversationService } from './service/conversation.service';
import { CsSafetyPolicyService } from './service/cs-safety-policy.service';
import { CsSystemActorService } from './service/cs-system-actor.service';
import { HandoffService } from './service/handoff.service';
import { IntentOrchestratorService } from './service/intent-orchestrator.service';
import { OtpDeliveryService } from './service/otp-delivery.service';
import { WhatsappOtpDeliveryAdapter } from './service/whatsapp-otp-delivery.adapter';
import { BookAppointmentTool } from './tools/definitions/book-appointment.tool';
import { ListAvailableSessionsTool } from './tools/definitions/list-available-sessions.tool';
import { SearchFaqTool } from './tools/definitions/search-faq.tool';
import { CsToolRegistrarService } from './tools/cs-tool-registrar.service';
import { CsToolRegistry } from './tools/cs-tool.registry';

/**
 * The conversational core of the WhatsApp/Telegram channel (`PCS-T06`,
 * `PCS-T07`, strategy §4.2): conversation state, transcript, orchestration,
 * the three tools, and the safety layer.
 *
 * **This module is what makes `PCS-T05`'s seam pay off.** It rebinds
 * `InboundMessageSink` to `ConversationService`, and not one line of the
 * gateway changes — the webhook still normalizes, dedups, and hands off, and
 * has no idea a state machine now exists behind it. The binding is here
 * rather than in `ChannelGatewayModule` on purpose: the dependency runs one
 * way, from the thinking half to the dumb pipe, and reversing it would put
 * business logic in the edge.
 *
 * The imports name the whole reach of the public channel, which is the point
 * of reading them: `AiChatbotModule` for the clinic's one configured provider
 * (§6), `DocumentManagementModule` for `search_faq`, and
 * `AppointmentManagementModule` plus `PatientManagementModule` for the booking
 * flow. There is no EMR, no billing, no registration and no pharmacy import
 * here, and there must not be — a module a public channel cannot import is a
 * module a prompt injection cannot reach.
 *
 * {@link OtpDeliveryService} is bound at `PCS-T09` to the WhatsApp gateway,
 * closing the last gap §5.1.1 left open. The tier needed a transport to the
 * patient's *registered* number rather than to the chat that asked, which
 * Telegram structurally cannot be — so it waited for WhatsApp and arrives as a
 * provider binding rather than as an edit to the booking flow. A deployment
 * running Telegram alone still resolves it, and the adapter refuses to send
 * against an unconfigured bridge, which the flow already treats as "cannot
 * challenge by code" and falls through to a draft booking.
 */
@Module({
  // `forwardRef` because the relationship genuinely runs both ways and
  // pretending otherwise would be the lie: inbound messages come *from* the
  // gateway, replies go back *through* it. Nest resolves providers per module,
  // so binding the sink here without this would leave the gateway's normalizer
  // still holding whatever its own module bound — the override would compile,
  // load, and silently do nothing.
  imports: [
    forwardRef(() => ChannelGatewayModule),
    AiChatbotModule,
    AppointmentManagementModule,
    AuthModule,
    DocumentManagementModule,
    PatientManagementModule,
  ],
  controllers: [CsAdminController, ChannelArrivalController],
  providers: [
    AdminConversationRepository,
    ChannelArrivalRepository,
    ChannelMetricsRepository,
    ChannelOtpChallengeRepository,
    ChannelPatientLinkRepository,
    ConversationRepository,
    ChannelArrivalService,
    ChannelMetricsService,
    CsAdminService,
    CsSafetyPolicyService,
    CsSystemActorService,
    ChannelVerificationService,
    ChannelBookingService,
    IntentOrchestratorService,
    HandoffService,
    ConversationService,
    CsToolRegistry,
    SearchFaqTool,
    ListAvailableSessionsTool,
    BookAppointmentTool,
    CsToolRegistrarService,
    {
      provide: InboundMessageSink,
      useExisting: ConversationService,
    },
    {
      provide: OtpDeliveryService,
      useClass: WhatsappOtpDeliveryAdapter,
    },
  ],
  exports: [ConversationRepository, HandoffService, InboundMessageSink],
})
export class CustomerServiceModule {}
