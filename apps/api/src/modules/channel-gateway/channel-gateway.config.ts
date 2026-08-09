import { ConfigService } from '@nestjs/config';

import { ChannelGatewayConfig, WA_GATEWAY_KINDS, WaGatewayKindValue } from '@hms/shared-types';

function readTrimmed(configService: ConfigService, key: string): string {
  return configService.get<string>(key)?.trim() ?? '';
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const parsed = Number(readTrimmed(configService, key));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * §2.1's human-like send pacing, in milliseconds.
 *
 * One second between consecutive outbound messages. Not tuned to a measured
 * limit, because WhatsApp publishes none for the unofficial protocol — it is
 * chosen to be visibly unlike a machine, which is the property that matters
 * for a ban heuristic. Configurable so a clinic warming a brand-new number can
 * slow it further without a code change.
 */
const DEFAULT_SEND_PACING_MS = 1_000;

function readGatewayKind(configService: ConfigService): WaGatewayKindValue {
  const configured = readTrimmed(configService, 'WA_GATEWAY_KIND').toUpperCase();
  // Falls back rather than throwing, for the same reason nothing else here
  // throws: a typo in an optional feature's variable must not stop the API
  // from booting. GOWA is the documented default (D-CS-01).
  return WA_GATEWAY_KINDS.find((kind) => kind === configured) ?? 'GOWA';
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
 * WhatsApp/Telegram channel — and an empty secret is handled where it matters
 * instead: both webhook guards refuse **every** request when their secret is
 * empty, so an unconfigured channel is closed rather than open. A boot-time
 * throw would make an unused feature able to take down the API.
 */
export function resolveChannelGatewayConfig(configService: ConfigService): ChannelGatewayConfig {
  return {
    isEnabled: readTrimmed(configService, 'CS_CHANNEL_ENABLED').toLowerCase() === 'true',
    telegram: {
      botToken: readTrimmed(configService, 'TELEGRAM_BOT_TOKEN'),
      webhookSecret: readTrimmed(configService, 'TELEGRAM_WEBHOOK_SECRET'),
    },
    whatsapp: {
      kind: readGatewayKind(configService),
      baseUrl: readTrimmed(configService, 'WA_GATEWAY_BASE_URL').replace(/\/+$/, ''),
      basicAuthUsername: readTrimmed(configService, 'WA_GATEWAY_BASIC_AUTH_USERNAME'),
      basicAuthPassword: readTrimmed(configService, 'WA_GATEWAY_BASIC_AUTH_PASSWORD'),
      apiKey: readTrimmed(configService, 'WA_GATEWAY_API_KEY'),
      sessionName: readTrimmed(configService, 'WA_GATEWAY_SESSION_NAME') || 'default',
      webhookSecret: readTrimmed(configService, 'WA_GATEWAY_WEBHOOK_SECRET'),
      deviceId: readTrimmed(configService, 'WA_GATEWAY_DEVICE_ID'),
      sendPacingMs: readPositiveInteger(
        configService,
        'WA_GATEWAY_SEND_PACING_MS',
        DEFAULT_SEND_PACING_MS,
      ),
    },
  };
}
