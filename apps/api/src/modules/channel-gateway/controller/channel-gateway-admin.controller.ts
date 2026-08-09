import { Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CHANNEL_GATEWAY_EXAMPLES } from '../../../common/openapi/channel-gateway-examples';
import { GowaWhatsappAdapter } from '../infrastructure/gowa-whatsapp.adapter';

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
  path: 'admin/channel-gateway/whatsapp',
})
export class ChannelGatewayAdminController {
  constructor(private readonly gowaAdapter: GowaWhatsappAdapter) {}

  @Get('session')
  @Auth([{ action: 'manage', subject: 'BpjsConfig' }])
  @ApiEndpoint({
    summary: 'Read the WhatsApp session’s health',
    responseDescription:
      'Whether the bridge is configured, reachable, and still paired. The three flags fail in different ways and want different responses: not configured means nobody set the gateway up, not connected usually resolves itself, and **not logged in is the one that needs a person with the clinic’s phone** — the pairing is gone and only a QR scan brings it back. An unreachable bridge answers with connected=false rather than erroring, because a status card that errors looks exactly like one nobody loaded.',
    responseExample: { data: CHANNEL_GATEWAY_EXAMPLES.sessionHealth },
  })
  async getSessionHealth(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.gowaAdapter.readSessionHealth();

    return { data: view };
  }

  @Post('session/pairing')
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
    const view = await this.gowaAdapter.startPairing();

    return { data: view, message: 'Pairing started' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
