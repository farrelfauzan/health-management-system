import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChannelGatewayConfig,
  InboundMessageOutcomeValue,
  TelegramWebhookUpdateInput,
} from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { ChannelInboundReceiptRepository } from '../repository/channel-inbound-receipt.repository';
import { InboundMessageSink } from './inbound-message-sink.service';
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
    private readonly inboundMessageSink: InboundMessageSink,
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
    if (!this.gatewayConfig.isEnabled) {
      return 'DISABLED';
    }
    const message = normalizeTelegramUpdate(update);
    if (message === null) {
      // Stickers, edits, joins, group chats, bots. Acknowledged and dropped.
      return 'IGNORED';
    }
    const isFirstDelivery = await this.receiptRepository.claimInboundMessage(message);
    if (!isFirstDelivery) {
      return 'DUPLICATE';
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
