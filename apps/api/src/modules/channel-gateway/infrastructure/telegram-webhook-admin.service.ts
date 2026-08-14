import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, GrammyError } from 'grammy';

import { ChannelGatewayConfig, TelegramWebhookHealth } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { TELEGRAM_WEBHOOK_ROUTE } from './telegram-webhook-route';

/**
 * Registering and inspecting the clinic's Telegram webhook (§8.4).
 *
 * Separate from {@link TelegramGatewayService} rather than folded into it, and
 * the reason is what that abstraction is for: it is the provider-neutral
 * contract for *sending a message*, and WhatsApp implements the same shape. A
 * webhook registration has no WhatsApp counterpart at all — the bridge holds a
 * paired session instead — so putting it behind that contract would make the
 * neutral interface carry a method only one provider can answer.
 *
 * **Nothing here is called automatically.** Registration is a deliberate act by
 * an administrator, never a startup side effect, because a bot token has
 * exactly one webhook globally: an API booting with production's `.env` on
 * somebody's laptop would take the clinic's traffic the moment it started, and
 * production would go quiet with no error anywhere. Requiring a button press
 * makes that require intent.
 */
@Injectable()
export class TelegramWebhookAdminService {
  private readonly logger = new Logger(TelegramWebhookAdminService.name);
  private readonly gatewayConfig: ChannelGatewayConfig;
  private readonly api: Api;

  constructor(configService: ConfigService) {
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
    // Constructed even with an empty token, matching `GrammyTelegramAdapter`:
    // a clinic not running this channel must still be able to start its API,
    // and `isConfigured` reports the gap instead.
    this.api = new Api(this.gatewayConfig.telegram.botToken);
  }

  /**
   * Reads Telegram's own view and adds the two comparisons it does not make.
   *
   * An unreachable Telegram answers with an unregistered-looking health rather
   * than throwing, for the same reason the WhatsApp session card reports
   * `connected: false` instead of erroring: a status card that errors looks
   * exactly like one nobody loaded.
   */
  async readHealth(): Promise<TelegramWebhookHealth> {
    const expectedUrl = this.buildExpectedUrl();
    const isConfigured =
      this.gatewayConfig.telegram.botToken !== '' &&
      this.gatewayConfig.telegram.webhookSecret !== '';
    const base = {
      isConfigured,
      isChannelEnabled: this.gatewayConfig.isEnabled,
      expectedUrl,
      checkedAt: new Date().toISOString(),
    };
    if (!isConfigured) {
      return {
        ...base,
        registeredUrl: null,
        isMatching: false,
        pendingUpdateCount: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
        isLastErrorStale: false,
      };
    }
    const info = await this.readWebhookInfo();
    if (info === null) {
      return {
        ...base,
        registeredUrl: null,
        isMatching: false,
        pendingUpdateCount: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
        isLastErrorStale: false,
      };
    }
    // Telegram reports an unregistered webhook as an empty string rather than
    // an absent field, and "" is not a url — normalising it to null here keeps
    // every caller from having to know that.
    const registeredUrl = info.url === undefined || info.url === '' ? null : info.url;
    const lastErrorAt =
      info.last_error_date === undefined ? null : new Date(info.last_error_date * 1000).toISOString();
    return {
      ...base,
      registeredUrl,
      isMatching: registeredUrl !== null && expectedUrl !== null && registeredUrl === expectedUrl,
      pendingUpdateCount: info.pending_update_count,
      lastErrorAt,
      lastErrorMessage: info.last_error_message ?? null,
      // Nothing pending means Telegram is delivering successfully right now,
      // so an error it still remembers belongs to a fault that has already
      // passed. Without this the card reports a resolved outage forever.
      isLastErrorStale: lastErrorAt !== null && info.pending_update_count === 0,
    };
  }

  /**
   * Points Telegram at this deployment, then proves it took.
   *
   * The verification read is not ceremony. `setWebhook` answers `ok: true` for
   * any well-formed url — Telegram does not check that the host is yours, and
   * will not discover otherwise until it tries to deliver. Reading the
   * registration back and refusing to report success unless it matches is what
   * turns a mistyped `HMS_DOMAIN` into a failure at deploy time rather than a
   * silent one at the first customer message.
   */
  async registerWebhook(): Promise<TelegramWebhookHealth> {
    const expectedUrl = this.buildExpectedUrl();
    if (expectedUrl === null) {
      throw new ServiceUnavailableException(
        'HMS_DOMAIN is not configured, so the webhook URL cannot be derived',
      );
    }
    if (
      this.gatewayConfig.telegram.botToken === '' ||
      this.gatewayConfig.telegram.webhookSecret === ''
    ) {
      throw new ServiceUnavailableException('Telegram channel is not configured');
    }
    try {
      await this.api.setWebhook(expectedUrl, {
        secret_token: this.gatewayConfig.telegram.webhookSecret,
      });
    } catch (caughtError) {
      // Telegram's own description quotes the request, which carries the
      // secret token — so only the numeric code is logged.
      this.logger.warn(
        buildSafeErrorLog('telegram_set_webhook_failed', {
          errorCode: caughtError instanceof GrammyError ? caughtError.error_code : null,
        }),
      );
      throw new ServiceUnavailableException('Telegram rejected the webhook registration');
    }
    const health = await this.readHealth();
    if (!health.isMatching) {
      throw new ServiceUnavailableException(
        'Telegram accepted the registration but is not pointing at this deployment',
      );
    }
    return health;
  }

  /**
   * `null` rather than a thrown error, so one unreachable dependency does not
   * turn the whole status card into an error state.
   */
  private async readWebhookInfo(): Promise<Awaited<ReturnType<Api['getWebhookInfo']>> | null> {
    try {
      return await this.api.getWebhookInfo();
    } catch (caughtError) {
      this.logger.warn(
        buildSafeErrorLog('telegram_get_webhook_info_failed', {
          errorCode: caughtError instanceof GrammyError ? caughtError.error_code : null,
        }),
      );
      return null;
    }
  }

  private buildExpectedUrl(): string | null {
    if (this.gatewayConfig.publicBaseUrl === '') {
      return null;
    }
    return `${this.gatewayConfig.publicBaseUrl}${TELEGRAM_WEBHOOK_ROUTE.publicPath}`;
  }
}
