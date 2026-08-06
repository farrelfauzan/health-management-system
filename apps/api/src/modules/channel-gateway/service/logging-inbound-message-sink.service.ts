import { Injectable, Logger } from '@nestjs/common';

import { InboundChannelMessage } from '@hms/shared-types';

import { InboundMessageSink } from './inbound-message-sink.service';

/**
 * The default sink, in force until `PCS-T06` replaces it: record that a
 * message arrived, and drop it.
 *
 * **It logs no message text**, at any level (§8.4). The body is a member of
 * the public's message to a clinic, and a log line is the one place it would
 * be retained outside the transcript with none of the transcript's retention
 * policy attached. The character count is enough to tell a real message from
 * an empty probe while carrying nothing of what was said.
 *
 * Dropping is the honest behaviour for this slice rather than a placeholder
 * that queues: nothing downstream exists to consume a queue yet, and a buffer
 * filling with messages nobody will ever answer is worse than not accepting
 * them. The channel is off by default, so in practice this path runs only for
 * someone deliberately testing the webhook.
 */
@Injectable()
export class LoggingInboundMessageSink extends InboundMessageSink {
  private readonly logger = new Logger(LoggingInboundMessageSink.name);

  handleInboundMessage(message: InboundChannelMessage): Promise<void> {
    this.logger.log(
      `Inbound ${message.channel} message accepted (chat=${message.externalChatId}, chars=${message.text.length}) — no conversation handler is registered yet (PCS-T06)`,
    );
    return Promise.resolve();
  }
}
