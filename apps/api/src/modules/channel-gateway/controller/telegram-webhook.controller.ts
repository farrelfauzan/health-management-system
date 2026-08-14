import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { TelegramWebhookUpdateDto } from '../dto/telegram-webhook-update.dto';
import { TelegramWebhookAuthGuard } from '../guard/telegram-webhook-auth.guard';
import { TELEGRAM_WEBHOOK_ROUTE } from '../infrastructure/telegram-webhook-route';
import { InboundMessageNormalizerService } from '../service/inbound-message-normalizer.service';

/**
 * Telegram's delivery endpoint (§2.2, §8.1).
 *
 * `@PublicRoute` for JWT purposes because Telegram holds no HMS session;
 * {@link TelegramWebhookAuthGuard} is the actual authentication, on the
 * secret token Telegram echoes from `setWebhook`.
 *
 * **Everything authenticated gets a 200**, and that is the load-bearing
 * decision in this file. Telegram redelivers any update it did not get a 2xx
 * for, with backoff, and eventually drops the webhook. So an update this
 * clinic cannot use — a sticker, a group message, a body that fails the
 * schema — must be acknowledged, not refused: returning 4xx would have
 * Telegram retrying one unusable message on a schedule, and returning 5xx on
 * a downstream fault would have it retrying a message that has *already been
 * claimed* by dedup, which the gateway would then correctly drop as a
 * duplicate forever. The reply body names the outcome so an operator tailing
 * the gateway can tell the four apart.
 *
 * `@ApiExcludeController` keeps it out of the OpenAPI document. The contract
 * there is the frontend's integration surface, and this route is Telegram's;
 * publishing it would put a webhook URL and its shape in a document served to
 * browsers.
 */
@ApiExcludeController()
@Controller({
  version: TELEGRAM_WEBHOOK_ROUTE.version,
  path: TELEGRAM_WEBHOOK_ROUTE.controllerPath,
})
export class TelegramWebhookController {
  constructor(
    private readonly inboundMessageNormalizer: InboundMessageNormalizerService,
  ) {}

  @Post(TELEGRAM_WEBHOOK_ROUTE.routePath)
  @HttpCode(200)
  @PublicRoute()
  @UseGuards(TelegramWebhookAuthGuard)
  async receiveUpdate(@Body() body: TelegramWebhookUpdateDto) {
    const outcome = await this.inboundMessageNormalizer.receiveTelegramUpdate(body);

    return { data: { outcome } };
  }
}
