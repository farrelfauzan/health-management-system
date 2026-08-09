import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChannelGatewayConfig,
  GowaWebhookEventInput,
  InboundChannelMessage,
  InboundMessageOutcomeValue,
  TelegramWebhookUpdateInput,
} from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { ChannelInboundReceiptRepository } from '../repository/channel-inbound-receipt.repository';
import { InboundMessageSink } from './inbound-message-sink.service';
import { normalizeGowaWebhook } from './normalize-gowa-webhook';
import { normalizeTelegramUpdate } from './normalize-telegram-update';

/**
 * The inbound half of the gateway: normalize, deduplicate, hand off.
 *
 * **The order is the whole design.** Dedup happens after normalization and
 * before the sink, so a retried webhook is refused by the unique index before
 * anything downstream can act on it — which is what stops a retried booking
 * message from booking twice (§4.1). Doing it the other way, or trusting a
 * downstream idempotency check, means the guarantee depends on every future
 * consumer remembering it.
 *
 * **A sink failure does not un-claim the message.** That is a real trade and
 * it is made deliberately: releasing the claim would let the gateway's retry
 * deliver it again, and a message that fails deterministically would then be
 * retried forever, each attempt doing whatever partial work it managed before
 * failing. At-most-once with a logged failure is the safer half of that choice
 * on a channel where the failure mode is a duplicate appointment.
 */
@Injectable()
export class InboundMessageNormalizerService {
  private readonly logger = new Logger(InboundMessageNormalizerService.name);
  private readonly gatewayConfig: ChannelGatewayConfig;

  constructor(
    configService: ConfigService,
    private readonly receiptRepository: ChannelInboundReceiptRepository,
    // Optional and forward-referenced: the sink is implemented by
    // `customer-service`, which imports this module back for the outbound
    // dispatcher. Optional so the gateway still boots — recording and
    // dropping — if the conversational half is removed or fails to load, and
    // so a message is never lost to a DI error the customer would see as
    // silence.
    @Optional()
    @Inject(forwardRef(() => InboundMessageSink))
    private readonly inboundMessageSink: InboundMessageSink | null = null,
  ) {
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
  }

  get config(): ChannelGatewayConfig {
    return this.gatewayConfig;
  }

  /**
   * Takes in one Telegram update and reports what became of it.
   *
   * Never throws for a message-level problem. Telegram retries any webhook it
   * did not get a 2xx for, so an update this clinic cannot handle must be
   * acknowledged rather than refused — otherwise one unparseable message is
   * redelivered on a schedule until Telegram gives up on the webhook
   * entirely, taking every other customer's messages with it.
   */
  async receiveTelegramUpdate(
    update: TelegramWebhookUpdateInput,
  ): Promise<InboundMessageOutcomeValue> {
    // Stickers, edits, joins, group chats, bots normalize to null and are
    // acknowledged and dropped.
    return this.acceptMessage(this.gatewayConfig.isEnabled ? normalizeTelegramUpdate(update) : null);
  }

  /**
   * Takes in one GOWA event and reports what became of it (`PCS-T09`).
   *
   * Identical in structure to the Telegram path and identical in its
   * never-throw contract, which is the point of the shared tail below: the two
   * webhooks differ in how a body is authenticated and how it is parsed, and
   * in nothing after that. A second copy of dedup-then-sink is a second place
   * for the at-most-once guarantee to drift.
   */
  async receiveWhatsappEvent(event: GowaWebhookEventInput): Promise<InboundMessageOutcomeValue> {
    // Receipts, presence, group chats, media with no body, and the clinic's
    // own echoed replies all normalize to null.
    return this.acceptMessage(this.gatewayConfig.isEnabled ? normalizeGowaWebhook(event) : null);
  }

  /**
   * Dedup, then hand off. Shared by both webhooks.
   *
   * A `null` message here means one of two different things — the channel is
   * switched off, or the event is not one this clinic answers — and they are
   * deliberately *not* distinguished, because the callers already know which
   * applies and the outcome only has to be true for an operator reading a log.
   */
  private async acceptMessage(
    message: InboundChannelMessage | null,
  ): Promise<InboundMessageOutcomeValue> {
    if (!this.gatewayConfig.isEnabled) {
      return 'DISABLED';
    }
    if (message === null) {
      return 'IGNORED';
    }
    const isFirstDelivery = await this.receiptRepository.claimInboundMessage(message);
    if (!isFirstDelivery) {
      return 'DUPLICATE';
    }
    if (this.inboundMessageSink === null) {
      // No conversational half registered. Recorded and dropped, with no
      // message text in the log (§8.4) — the character count separates a real
      // message from an empty probe while carrying nothing of what was said.
      this.logger.log(
        `Inbound ${message.channel} message accepted with no handler registered (chat=${message.externalChatId}, chars=${message.text.length})`,
      );
      return 'ACCEPTED';
    }
    try {
      await this.inboundMessageSink.handleInboundMessage(message);
    } catch (caughtError) {
      // Logged with no body and no upstream message: a downstream error is
      // free to quote the text that caused it, and that text is a member of
      // the public's.
      this.logger.error(
        buildSafeErrorLog('inbound_message_handler_failed', {
          channel: message.channel,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
    }
    return 'ACCEPTED';
  }
}
