import { ConfigService } from '@nestjs/config';

import { ChannelGatewayConfig } from '@hms/shared-types';

function readTrimmed(configService: ConfigService, key: string): string {
  return configService.get<string>(key)?.trim() ?? '';
}

/**
 * Resolves the customer-service channel configuration at startup
 * (strategy §8.5).
 *
 * `CS_CHANNEL_ENABLED` defaults **off**, like every other channel and worker
 * flag in this codebase. With it off the webhooks still exist and still
 * authenticate, but they do no work: turning it on is the deliberate act that
 * says a bot token has been issued and a webhook has been registered.
 *
 * **Nothing here throws on a missing value**, which is a departure from
 * `resolveStorageConfig` and deliberate. Those configurations are required for
 * the app to function at all, so failing at boot is the right, loud outcome.
 * This one is optional by design — most deployments will never run the
 * WhatsApp/Telegram channel — and an empty `TELEGRAM_WEBHOOK_SECRET` is
 * handled where it matters instead: the guard refuses **every** request when
 * the secret is empty, so an unconfigured channel is closed rather than open.
 * A boot-time throw would make an unused feature able to take down the API.
 */
export function resolveChannelGatewayConfig(configService: ConfigService): ChannelGatewayConfig {
  return {
    isEnabled: readTrimmed(configService, 'CS_CHANNEL_ENABLED').toLowerCase() === 'true',
    telegram: {
      botToken: readTrimmed(configService, 'TELEGRAM_BOT_TOKEN'),
      webhookSecret: readTrimmed(configService, 'TELEGRAM_WEBHOOK_SECRET'),
    },
  };
}
