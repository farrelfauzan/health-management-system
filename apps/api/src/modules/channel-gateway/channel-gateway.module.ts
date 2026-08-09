import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CustomerServiceModule } from '../customer-service/customer-service.module';
import { ChannelGatewayAdminController } from './controller/channel-gateway-admin.controller';
import { TelegramWebhookController } from './controller/telegram-webhook.controller';
import { WhatsappWebhookController } from './controller/whatsapp-webhook.controller';
import { GowaWhatsappAdapter } from './infrastructure/gowa-whatsapp.adapter';
import { GrammyTelegramAdapter } from './infrastructure/grammy-telegram.adapter';
import { TelegramGatewayService } from './infrastructure/telegram-gateway.service';
import { WhatsappGatewayService } from './infrastructure/whatsapp-gateway.service';
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
 * Telegram shipped alone at `PCS-T05` (D-CS-05) — free, official, no ban risk
 * — so the whole conversational core was exercised end to end before a real
 * WhatsApp number was exposed. **`PCS-T09` binds WhatsApp**, and the shape of
 * that change is the point: {@link WhatsappGatewayService} was declared and
 * unbound, the dispatcher already branched on channel, and turning the channel
 * on is a `useClass` below plus a webhook controller. `PCS-T10`'s WAHA adapter
 * replaces one line of it.
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
  imports: [AuthModule, forwardRef(() => CustomerServiceModule)],
  controllers: [
    TelegramWebhookController,
    WhatsappWebhookController,
    ChannelGatewayAdminController,
  ],
  providers: [
    ChannelInboundReceiptRepository,
    InboundMessageNormalizerService,
    OutboundMessageDispatcherService,
    {
      provide: TelegramGatewayService,
      useClass: GrammyTelegramAdapter,
    },
    // The concrete class is provided alongside the port so the admin
    // status surface can ask GOWA-specific questions — session health and QR
    // pairing (§8.4) — that no other bridge's port should be widened to carry.
    // The port stays the only thing the dispatcher knows about.
    GowaWhatsappAdapter,
    {
      provide: WhatsappGatewayService,
      useExisting: GowaWhatsappAdapter,
    },
  ],
  exports: [OutboundMessageDispatcherService, WhatsappGatewayService, GowaWhatsappAdapter],
})
export class ChannelGatewayModule {}
