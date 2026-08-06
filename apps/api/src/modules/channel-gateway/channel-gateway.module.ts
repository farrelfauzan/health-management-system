import { Module } from '@nestjs/common';

import { TelegramWebhookController } from './controller/telegram-webhook.controller';
import { GrammyTelegramAdapter } from './infrastructure/grammy-telegram.adapter';
import { TelegramGatewayService } from './infrastructure/telegram-gateway.service';
import { ChannelInboundReceiptRepository } from './repository/channel-inbound-receipt.repository';
import { InboundMessageNormalizerService } from './service/inbound-message-normalizer.service';
import { InboundMessageSink } from './service/inbound-message-sink.service';
import { LoggingInboundMessageSink } from './service/logging-inbound-message-sink.service';
import { OutboundMessageDispatcherService } from './service/outbound-message-dispatcher.service';

/**
 * The edge of the customer-service channel (`PCS-T05`, strategy §4.1).
 *
 * **Zero business logic, by construction.** Webhooks in, normalized messages
 * out, replies dispatched to whichever gateway a conversation runs on.
 * Everything that decides *what to say* — the conversation state machine, the
 * tool loop, safety and handoff — is `customer-service` at `PCS-T06`, and the
 * seam between them is {@link InboundMessageSink}: that module will bind its
 * own implementation and no controller here will change.
 *
 * Telegram ships alone in this slice (D-CS-05). It is free, official, and
 * carries no ban risk, so the whole conversational core can be exercised end
 * to end before a real WhatsApp number is ever exposed.
 * {@link WhatsappGatewayService} is declared but unbound: `PCS-T09` adds the
 * GOWA adapter and `PCS-T10` the WAHA one, and because the dispatcher already
 * branches on channel, both are a provider binding rather than an edit here.
 *
 * The module is registered unconditionally while `CS_CHANNEL_ENABLED` gates
 * the *work*: the webhook still authenticates with the flag off and answers
 * `DISABLED`. Registering the routes conditionally would instead 404 them,
 * and a 404 tells Telegram the webhook is gone — which is a different, and
 * much harder to diagnose, thing than "configured but paused".
 */
@Module({
  controllers: [TelegramWebhookController],
  providers: [
    ChannelInboundReceiptRepository,
    InboundMessageNormalizerService,
    OutboundMessageDispatcherService,
    {
      provide: TelegramGatewayService,
      useClass: GrammyTelegramAdapter,
    },
    {
      provide: InboundMessageSink,
      useClass: LoggingInboundMessageSink,
    },
  ],
  exports: [OutboundMessageDispatcherService],
})
export class ChannelGatewayModule {}
