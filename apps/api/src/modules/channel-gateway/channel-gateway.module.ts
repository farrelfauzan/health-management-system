import { forwardRef, Module } from '@nestjs/common';

import { CustomerServiceModule } from '../customer-service/customer-service.module';
import { TelegramWebhookController } from './controller/telegram-webhook.controller';
import { GrammyTelegramAdapter } from './infrastructure/grammy-telegram.adapter';
import { TelegramGatewayService } from './infrastructure/telegram-gateway.service';
import { ChannelInboundReceiptRepository } from './repository/channel-inbound-receipt.repository';
import { InboundMessageNormalizerService } from './service/inbound-message-normalizer.service';
import { OutboundMessageDispatcherService } from './service/outbound-message-dispatcher.service';

/**
 * The edge of the customer-service channel (`PCS-T05`, strategy §4.1).
 *
 * **Zero business logic, by construction.** Webhooks in, normalized messages
 * out, replies dispatched to whichever gateway a conversation runs on.
 * Everything that decides *what to say* is `customer-service` (`PCS-T06`),
 * reached only through the `InboundMessageSink` port — this module names the
 * seam and never imports a state machine, a prompt, or a provider.
 *
 * Telegram ships alone in this slice (D-CS-05). It is free, official, and
 * carries no ban risk, so the whole conversational core can be exercised end
 * to end before a real WhatsApp number is ever exposed.
 * {@link WhatsappGatewayService} is declared but unbound: `PCS-T09` adds the
 * GOWA adapter and `PCS-T10` the WAHA one, and because the dispatcher already
 * branches on channel, both are a provider binding rather than an edit here.
 *
 * The `forwardRef` to `CustomerServiceModule` is the sink arriving, and the
 * cycle is real rather than accidental: inbound messages travel from here to
 * there, replies travel back. The sink stays `@Optional()` in the normalizer
 * so this module still boots — logging and dropping — if the conversational
 * half is ever removed or fails to load.
 *
 * The module is registered unconditionally while `CS_CHANNEL_ENABLED` gates
 * the *work*: the webhook still authenticates with the flag off and answers
 * `DISABLED`. Registering the routes conditionally would instead 404 them,
 * and a 404 tells Telegram the webhook is gone — which is a different, and
 * much harder to diagnose, thing than "configured but paused".
 */
@Module({
  imports: [forwardRef(() => CustomerServiceModule)],
  controllers: [TelegramWebhookController],
  providers: [
    ChannelInboundReceiptRepository,
    InboundMessageNormalizerService,
    OutboundMessageDispatcherService,
    {
      provide: TelegramGatewayService,
      useClass: GrammyTelegramAdapter,
    },
  ],
  exports: [OutboundMessageDispatcherService],
})
export class ChannelGatewayModule {}
