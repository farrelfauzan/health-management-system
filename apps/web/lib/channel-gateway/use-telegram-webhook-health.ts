import type { TelegramWebhookHealth } from '@hms/shared-types';

import {
  channelGatewayAdminControllerGetTelegramWebhookHealthV1,
  getChannelGatewayAdminControllerGetTelegramWebhookHealthV1QueryKey,
} from '#lib/api/generated/channel-gateway/channel-gateway';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * How often the webhook registration is re-checked.
 *
 * A minute rather than the WhatsApp card's thirty seconds, because the two
 * watch for different things. A WhatsApp session drops on its own at any
 * moment; a webhook registration only changes when somebody changes it — a
 * deploy, another environment registering the same bot. Polling faster would
 * spend a Telegram API call per tab to watch a value that is stable for days.
 */
const WEBHOOK_POLL_INTERVAL_MS = 60_000;

export function useTelegramWebhookHealth() {
  const query = useApiQuery<TelegramWebhookHealth>({
    queryKey: getChannelGatewayAdminControllerGetTelegramWebhookHealthV1QueryKey(),
    queryFn: (signal) => channelGatewayAdminControllerGetTelegramWebhookHealthV1(signal),
    errorMessage: 'Unable to read the Telegram webhook status.',
    options: { retry: false, refetchInterval: WEBHOOK_POLL_INTERVAL_MS },
  });

  return { ...query, webhook: query.data };
}
