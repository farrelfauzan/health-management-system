import { createHmac, timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChannelGatewayConfig } from '@hms/shared-types';

import { resolveChannelGatewayConfig } from '../channel-gateway.config';

/** The header GOWA sends its HMAC in. */
const WHATSAPP_SIGNATURE_HEADER = 'x-hub-signature-256';

/** GOWA prefixes the hex digest with its algorithm, GitHub-style. */
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Authenticates a GOWA webhook call (`PCS-T09`, §8.1).
 *
 * The endpoint is `@PublicRoute` for JWT purposes — the bridge holds no HMS
 * session — so this guard is the only thing standing in front of it, exactly
 * as {@link TelegramWebhookAuthGuard} is for its own. The difference is what
 * is being checked: Telegram echoes a fixed secret, while GOWA signs the
 * **body** with HMAC-SHA256. That is the stronger of the two — a fixed secret
 * replayed from a captured request is still valid, whereas a signature only
 * authenticates the bytes it was computed over.
 *
 * Which is why this reads `request.rawBody` and not the parsed object.
 * Verifying against `JSON.stringify(body)` would be verifying a
 * re-serialisation of what GOWA sent: key order, whitespace, and unicode
 * escaping are all free to differ, so the check would fail on honest
 * deliveries — and an implementation that "fixed" that by loosening the
 * comparison would be no check at all. `rawBody: true` in `main.ts` is what
 * makes the exact bytes available.
 *
 * **An unconfigured secret closes the endpoint rather than opening it**, the
 * same rule the Telegram guard follows and for the same reason: a deployment
 * that never set the variable would otherwise be running an unauthenticated
 * public endpoint that accepts anything. Here it matters more, because a
 * forged inbound message on this channel can book an appointment.
 */
@Injectable()
export class WhatsappWebhookAuthGuard implements CanActivate {
  private readonly gatewayConfig: ChannelGatewayConfig;

  constructor(configService: ConfigService) {
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
  }

  canActivate(context: ExecutionContext): boolean {
    const expectedSecret = this.gatewayConfig.whatsapp.webhookSecret;
    if (expectedSecret === '') {
      throw new UnauthorizedException('WhatsApp webhook is not configured');
    }
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      rawBody?: Buffer;
    }>();
    const rawBody = request.rawBody;
    if (rawBody === undefined) {
      // Not a client error to hide: it means `rawBody` is off in bootstrap,
      // and every delivery would be refused. Refusing is still the correct
      // outcome — silently accepting unsigned bodies is the alternative.
      throw new UnauthorizedException('WhatsApp webhook body could not be verified');
    }
    const headerValue = request.headers?.[WHATSAPP_SIGNATURE_HEADER];
    const presentedSignature = typeof headerValue === 'string' ? headerValue : '';
    if (!this.isMatchingSignature(presentedSignature, rawBody, expectedSecret)) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }
    return true;
  }

  /**
   * Compared as **hex text, constant-time**, after stripping the algorithm
   * prefix.
   *
   * Decoding to bytes first would be the tidier-looking version and is worse:
   * `Buffer.from(value, 'hex')` silently truncates at the first invalid pair,
   * so `sha256=zz` decodes to an empty buffer — which would then have to be
   * length-checked against a 32-byte digest anyway, and any implementation
   * that forgot would compare two empty buffers and return true.
   */
  private isMatchingSignature(presented: string, rawBody: Buffer, secret: string): boolean {
    const normalised = presented.startsWith(SIGNATURE_PREFIX)
      ? presented.slice(SIGNATURE_PREFIX.length)
      : presented;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const presentedBuffer = Buffer.from(normalised, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (presentedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(presentedBuffer, expectedBuffer);
  }
}
