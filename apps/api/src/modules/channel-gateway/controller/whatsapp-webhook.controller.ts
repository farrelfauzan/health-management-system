import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { WhatsappWebhookEventDto } from '../dto/whatsapp-webhook-event.dto';
import { WhatsappWebhookAuthGuard } from '../guard/whatsapp-webhook-auth.guard';
import { InboundMessageNormalizerService } from '../service/inbound-message-normalizer.service';

/**
 * The WhatsApp bridge's delivery endpoint (`PCS-T09`, §2.1, §8.1).
 *
 * **One route for both bridges** (`PCS-T10`). The webhook URL is the thing an
 * operator registers inside the running container, so a failover that also
 * required editing it would be a failover with an extra step to forget under
 * pressure — the body shape is resolved from configuration instead.
 *
 * `@PublicRoute` for JWT purposes because GOWA holds no HMS session;
 * {@link WhatsappWebhookAuthGuard} is the actual authentication, on the
 * HMAC-SHA256 signature GOWA computes over the body.
 *
 * **Everything authenticated gets a 200**, the same rule the Telegram webhook
 * follows and for a sharper reason. GOWA retries what it did not get a 2xx
 * for, and this bridge's events include the clinic's own outbound messages
 * echoed back: a 4xx on one of those would have the bridge redelivering the
 * clinic's own reply on a schedule. So an event this channel cannot use — a
 * receipt, a presence update, a group message, a media message with no body —
 * is acknowledged and dropped, and the reply body names which of the four
 * outcomes it was so an operator tailing the gateway can tell them apart.
 *
 * `@ApiExcludeController` keeps it out of the OpenAPI document, which is the
 * frontend's integration surface. This route's caller is a container on a
 * private network, and publishing its shape would put a webhook URL in a
 * document served to browsers.
 */
@ApiExcludeController()
@Controller({
  version: '1',
  path: 'channels/whatsapp',
})
export class WhatsappWebhookController {
  constructor(private readonly inboundMessageNormalizer: InboundMessageNormalizerService) {}

  @Post('webhook')
  @HttpCode(200)
  @PublicRoute()
  @UseGuards(WhatsappWebhookAuthGuard)
  async receiveEvent(@Body() body: WhatsappWebhookEventDto) {
    const outcome = await this.inboundMessageNormalizer.receiveWhatsappEvent(body);

    return { data: { outcome } };
  }
}
