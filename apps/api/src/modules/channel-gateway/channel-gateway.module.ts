import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { CustomerServiceModule } from '../customer-service/customer-service.module';
import { DocumentDeliveryModule } from '../document-delivery/document-delivery.module';
import { ChannelGatewayAdminController } from './controller/channel-gateway-admin.controller';
import { TelegramWebhookController } from './controller/telegram-webhook.controller';
import { WhatsappWebhookController } from './controller/whatsapp-webhook.controller';
import { GowaWhatsappAdapter } from './infrastructure/gowa-whatsapp.adapter';
import { GrammyTelegramAdapter } from './infrastructure/grammy-telegram.adapter';
import { resolveWhatsappAdapter } from './infrastructure/resolve-whatsapp-adapter';
import { TelegramGatewayService } from './infrastructure/telegram-gateway.service';
import { TelegramWebhookAdminService } from './infrastructure/telegram-webhook-admin.service';
import { WahaWhatsappAdapter } from './infrastructure/waha-whatsapp.adapter';
import { WhatsappGatewayService } from './infrastructure/whatsapp-gateway.service';
import { WhatsappSessionService } from './infrastructure/whatsapp-session.service';
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
 * WhatsApp number was exposed. `PCS-T09` bound WhatsApp through GOWA, and
 * **`PCS-T10` adds WAHA behind the same two ports**: the bridge is now chosen
 * from `WA_GATEWAY_KIND` by one factory, and nothing outside
 * `infrastructure/` knows which is bound. That is D-CS-01 made checkable
 * rather than asserted — the contract suite runs the same fixture
 * conversations through both adapters, and the official Cloud API joins as a
 * third `WhatsappGatewayService` without touching the session port it has no
 * QR code for.
 *
 * The `forwardRef` to `CustomerServiceModule` is the sink arriving, and the
 * cycle is real rather than accidental: inbound messages travel from here to
 * there, replies travel back. The sink stays `@Optional()` in the normalizer
 * so this module still boots — logging and dropping — if the conversational
 * half is ever removed or fails to load. `DocumentDeliveryModule` arrives the
 * same way at `P16-T24`, binding `InboundOptOutHandler` so a patient's
 * `BERHENTI` is honoured before the sink — and, like the sink, it is optional
 * to the normalizer.
 *
 * The module is registered unconditionally while `CS_CHANNEL_ENABLED` gates
 * the *work*: the webhook still authenticates with the flag off and answers
 * `DISABLED`. Registering the routes conditionally would instead 404 them,
 * and a 404 tells Telegram the webhook is gone — which is a different, and
 * much harder to diagnose, thing than "configured but paused".
 */
@Module({
  imports: [
    AuthModule,
    forwardRef(() => CustomerServiceModule),
    forwardRef(() => DocumentDeliveryModule),
  ],
  controllers: [
    TelegramWebhookController,
    WhatsappWebhookController,
    ChannelGatewayAdminController,
  ],
  providers: [
    ChannelInboundReceiptRepository,
    InboundMessageNormalizerService,
    OutboundMessageDispatcherService,
    // Bound as a concrete class rather than behind a port, unlike the
    // messaging adapters: a webhook registration is a Telegram concept with no
    // WhatsApp counterpart, so a provider-neutral token would be an interface
    // only one implementation could ever answer.
    TelegramWebhookAdminService,
    {
      provide: TelegramGatewayService,
      useClass: GrammyTelegramAdapter,
    },
    // Both adapters are constructed on every boot and only one is bound.
    // Neither opens a connection in its constructor, so the unselected one
    // costs nothing — and a change that breaks its construction then fails
    // immediately rather than on the day of a failover, which is the worst
    // possible day to find out.
    GowaWhatsappAdapter,
    WahaWhatsappAdapter,
    {
      provide: WhatsappGatewayService,
      useFactory: resolveWhatsappAdapter,
      inject: [ConfigService, GowaWhatsappAdapter, WahaWhatsappAdapter],
    },
    {
      // The same instance behind both ports: one bridge, asked two different
      // kinds of question. Resolved through the messaging token rather than
      // by calling the factory twice, so the two can never disagree about
      // which bridge the clinic is on.
      provide: WhatsappSessionService,
      useExisting: WhatsappGatewayService,
    },
  ],
  exports: [OutboundMessageDispatcherService, WhatsappGatewayService, WhatsappSessionService],
})
export class ChannelGatewayModule {}
