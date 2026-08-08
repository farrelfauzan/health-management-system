import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';

import { OutboundChannelMessage } from '@hms/shared-types';

import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { WhatsappGatewayService } from '../infrastructure/whatsapp-gateway.service';

/**
 * Picks the adapter for a reply from the conversation's own channel (§4.1).
 *
 * This is the reason everything upstream can be channel-blind: a conversation
 * service composes an `OutboundChannelMessage` and never learns whether it
 * left over the Bot API or a self-hosted WhatsApp bridge.
 *
 * **The `WHATSAPP` branch is wired and currently unsatisfiable.** No adapter
 * is bound to `WhatsappGatewayService` until `PCS-T09`, so Nest cannot inject
 * one and the constructor takes it as optional; a reply addressed to WhatsApp
 * before then fails loudly here rather than being silently dropped or, worse,
 * delivered to the wrong customer over Telegram. Writing the branch now is
 * also what keeps `PCS-T09` a provider binding rather than an edit to this
 * file.
 */
@Injectable()
export class OutboundMessageDispatcherService {
  constructor(
    private readonly telegramGateway: TelegramGatewayService,
    // `@Optional()` and not a default parameter: Nest resolves constructor
    // dependencies by token and would fail to instantiate this service
    // entirely for a provider nothing binds yet. The decorator is what makes
    // "no WhatsApp adapter" a null here instead of a boot failure.
    @Optional() private readonly whatsappGateway: WhatsappGatewayService | null = null,
  ) {}

  async sendMessage(message: OutboundChannelMessage): Promise<void> {
    // The flag is added only when it is set, so an ordinary reply reaches an
    // adapter as exactly the request it did before `PCS-T07` — the WhatsApp
    // adapters at `PCS-T09`/`PCS-T10` are written against this shape, and a
    // field that is always present is a field they have to think about.
    const request = {
      externalChatId: message.externalChatId,
      text: message.text,
      ...(message.requestContact === true ? { requestContact: true } : {}),
    };
    if (message.channel === 'TELEGRAM') {
      await this.telegramGateway.sendText(request);
      return;
    }
    if (this.whatsappGateway === null) {
      throw new ServiceUnavailableException(
        'The WhatsApp channel has no gateway adapter configured',
      );
    }
    await this.whatsappGateway.sendText(request);
  }
}
