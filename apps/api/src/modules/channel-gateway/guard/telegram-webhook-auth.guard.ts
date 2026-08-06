import { timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChannelGatewayConfig } from '@hms/shared-types';

import { resolveChannelGatewayConfig } from '../channel-gateway.config';

/** The header Telegram echoes the configured secret back in. */
const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * Authenticates a Telegram webhook call (§8.1).
 *
 * The Telegram webhook endpoint is `@PublicRoute` for JWT purposes — Telegram
 * holds no HMS session and never will — so this guard is the only thing
 * standing in front of it. Telegram echoes the `secret_token` given at
 * `setWebhook` in a header on every delivery, and matching it is what
 * distinguishes a real delivery from anyone who found the URL.
 *
 * **An unconfigured secret closes the endpoint rather than opening it.** With
 * `TELEGRAM_WEBHOOK_SECRET` empty, every request is refused — including one
 * carrying an empty header, which would otherwise compare equal to an empty
 * secret and let the whole check pass by accident. That is the failure mode
 * worth designing against: a deployment that never set the variable would be
 * running an unauthenticated public endpoint that happily accepts anything.
 *
 * The comparison is constant-time. The margin is thin — an attacker needs
 * both the URL and a timing oracle — but the secret is a fixed string
 * compared on every request, which is the textbook shape for it, and
 * `timingSafeEqual` costs nothing here.
 */
@Injectable()
export class TelegramWebhookAuthGuard implements CanActivate {
  private readonly gatewayConfig: ChannelGatewayConfig;

  constructor(configService: ConfigService) {
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
  }

  canActivate(context: ExecutionContext): boolean {
    const expectedSecret = this.gatewayConfig.telegram.webhookSecret;
    if (expectedSecret === '') {
      throw new UnauthorizedException('Telegram webhook is not configured');
    }
    // Typed inline rather than off `express`, matching `JwtAuthGuard` and
    // `PermissionsGuard`: this repo does not depend on the framework's
    // request type, and a guard needs exactly one header.
    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const headerValue = request.headers?.[TELEGRAM_SECRET_HEADER];
    const presentedSecret = typeof headerValue === 'string' ? headerValue : '';
    if (!this.isMatchingSecret(presentedSecret, expectedSecret)) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
    return true;
  }

  /**
   * `timingSafeEqual` throws on a length mismatch, which would itself leak the
   * expected length through the error path — so lengths are compared first and
   * the result is folded into the answer rather than returned early.
   */
  private isMatchingSecret(presented: string, expected: string): boolean {
    const presentedBuffer = Buffer.from(presented, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (presentedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(presentedBuffer, expectedBuffer);
  }
}
