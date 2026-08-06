import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { autoRetry } from '@grammyjs/auto-retry';
import { Api, GrammyError } from 'grammy';

import { ChannelGatewayConfig } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { SendChannelTextRequest } from './channel-gateway.types';
import { TelegramGatewayService } from './telegram-gateway.service';

/**
 * Telegram Bot API adapter built on grammY.
 *
 * **grammY is used as an API client and nothing more.** The library's headline
 * feature is `Bot` with middleware and `webhookCallback`, and neither is used
 * here: `webhookCallback` would take over routing and hand this codebase a
 * grammY `Context`, when §8.1 puts the secret-token check in a Nest guard and
 * the repo contract puts inbound parsing in a Zod schema in
 * `@hms/shared-types`. A framework that owns the request would fight both. So
 * the standalone `Api` class is what is constructed — no middleware, no
 * update loop, no session store.
 *
 * What grammY still earns its place for is the outbound half, where hand-rolled
 * `fetch` calls go wrong quietly: it tracks Bot API versions, and it turns a
 * failed call into a typed {@link GrammyError} carrying Telegram's own
 * `error_code` and `parameters.retry_after` instead of an opaque body.
 * `autoRetry` then handles 429 by waiting exactly as long as Telegram asked —
 * the flood control §8.3's send pacing depends on, and the single most common
 * thing a naive client gets wrong.
 *
 * The token is read once at construction. An empty token constructs an `Api`
 * that fails on first use rather than at boot, which is deliberate and matches
 * `resolveChannelGatewayConfig`: a clinic not running this channel must not be
 * unable to start its API.
 */
@Injectable()
export class GrammyTelegramAdapter extends TelegramGatewayService {
  private readonly logger = new Logger(GrammyTelegramAdapter.name);
  private readonly gatewayConfig: ChannelGatewayConfig;
  private readonly api: Api;

  constructor(configService: ConfigService) {
    super();
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
    this.api = new Api(this.gatewayConfig.telegram.botToken);
    // Retries 429 on Telegram's own schedule. Capped rather than unbounded:
    // a chat that keeps flooding must eventually surface as a failed send an
    // operator can see, not as a request that never returns.
    this.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));
  }

  async sendText(request: SendChannelTextRequest): Promise<void> {
    if (this.gatewayConfig.telegram.botToken === '') {
      throw new ServiceUnavailableException('Telegram channel is not configured');
    }
    try {
      await this.api.sendMessage(request.externalChatId, request.text);
    } catch (caughtError) {
      // The log carries Telegram's numeric code and nothing else. A
      // `GrammyError`'s description quotes the request that produced it, and
      // on this channel that request contains a customer's message text.
      this.logger.warn(
        buildSafeErrorLog('telegram_send_failed', {
          errorCode: caughtError instanceof GrammyError ? caughtError.error_code : null,
        }),
      );
      throw new ServiceUnavailableException('Telegram rejected the message');
    }
  }
}
