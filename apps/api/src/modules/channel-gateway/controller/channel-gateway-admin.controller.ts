import { Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CHANNEL_GATEWAY_EXAMPLES } from '../../../common/openapi/channel-gateway-examples';
import { TelegramWebhookAdminService } from '../infrastructure/telegram-webhook-admin.service';
import { WhatsappSessionService } from '../infrastructure/whatsapp-session.service';

/**
 * The operational surface of the WhatsApp bridge (`PCS-T09`, §8.4).
 *
 * §8.4 names a silently logged-out WhatsApp session as the channel's number
 * one operational failure mode, and *silent* is the word that matters: nothing
 * errors. The bridge keeps answering, the API keeps accepting bookings, the
 * conversation state machine keeps working — and every reply is simply never
 * delivered. A clinic can lose a day of customer messages without a single
 * log line saying so. These two routes exist to make that visible and fixable
 * without shell access to the container.
 *
 * They depend on {@link WhatsappSessionService}, not on a vendor class
 * (`PCS-T10`): which bridge is running is a deployment fact, and a controller
 * that named GOWA would have to be edited to fail over to WAHA — which is
 * precisely the redesign D-CS-01 exists to avoid.
 *
 * Both sit behind `BpjsConfig`'s `manage` grant rather than a new one. The
 * question they answer is the same question that grant already exists for —
 * "is this clinic's outbound integration alive, and may I re-authenticate it"
 * — and pairing a WhatsApp session is the same kind of custody as holding a
 * BPJS credential. A separate grant would be a fifth thing to remember to
 * assign for no additional boundary.
 */
@ApiTags('Channel Gateway')
@Controller({
  version: '1',
  path: 'admin/channel-gateway',
})
export class ChannelGatewayAdminController {
  constructor(
    private readonly whatsappSession: WhatsappSessionService,
    private readonly telegramWebhookAdmin: TelegramWebhookAdminService,
  ) {}

  @Get('whatsapp/session')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Read the WhatsApp session’s health',
    responseDescription:
      'Whether the bridge is configured, reachable, and still paired. The three flags fail in different ways and want different responses: not configured means nobody set the gateway up, not connected usually resolves itself, and **not logged in is the one that needs a person with the clinic’s phone** — the pairing is gone and only a QR scan brings it back. An unreachable bridge answers with connected=false rather than erroring, because a status card that errors looks exactly like one nobody loaded.',
    responseExample: { data: CHANNEL_GATEWAY_EXAMPLES.sessionHealth },
  })
  async getSessionHealth(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.whatsappSession.readSessionHealth();

    return { data: view };
  }

  @Post('whatsapp/session/pairing')
  @HttpCode(200)
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Start a QR pairing for the WhatsApp session',
    responseDescription:
      'Begins re-authentication and returns the bridge’s own QR link. The link points at the bridge on the private network and is **not** proxied through HMS: fetching the image and re-serving it would put a live pairing credential in an HMS response and its caches, and a WhatsApp pairing code grants the session outright. Scan it from inside that network, then poll GET /session until isLoggedIn is true.',
    responseExample: {
      data: CHANNEL_GATEWAY_EXAMPLES.pairingSession,
      message: 'Pairing started',
    },
  })
  async startPairing(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.whatsappSession.startPairing();

    return { data: view, message: 'Pairing started' };
  }

  @Get('telegram/webhook')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Read the Telegram webhook’s registration health',
    responseDescription:
      'Where Telegram is currently pointed, and whether that is this deployment. `isMatching` is the field to read first: a bot token has exactly one webhook **globally**, so a second environment registering with the same token silently takes the traffic and leaves this one quiet with a healthy-looking configuration — nothing errors anywhere. `isLastErrorStale` is the second: Telegram never clears `lastErrorMessage` on a successful delivery, only overwrites it on the next failure, so a resolved outage otherwise reads as a live one forever. Neither the bot token nor the webhook secret appears here.',
    responseExample: { data: CHANNEL_GATEWAY_EXAMPLES.telegramWebhookHealth },
  })
  async getTelegramWebhookHealth(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.telegramWebhookAdmin.readHealth();

    return { data: view };
  }

  @Post('telegram/webhook')
  @HttpCode(200)
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Point Telegram at this deployment',
    responseDescription:
      'Registers the webhook and returns the health read back afterwards. **The URL is not an input.** It is derived from `HMS_DOMAIN` and the route this API actually serves, so the request body is empty: a URL that came from the caller would make this endpoint a way to redirect the clinic’s bot traffic to any host on the internet. Telegram answers `ok` for any well-formed URL without checking that the host is yours, so the registration is read back and this route fails rather than reporting success when Telegram is not pointing here.',
    responseExample: {
      data: CHANNEL_GATEWAY_EXAMPLES.telegramWebhookHealth,
      message: 'Telegram webhook registered',
    },
  })
  async registerTelegramWebhook(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.telegramWebhookAdmin.registerWebhook();

    return { data: view, message: 'Telegram webhook registered' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
