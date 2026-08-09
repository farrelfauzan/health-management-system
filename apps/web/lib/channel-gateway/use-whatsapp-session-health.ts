import type { WhatsappSessionHealth } from '@hms/shared-types';

import {
  channelGatewayAdminControllerGetSessionHealthV1,
  getChannelGatewayAdminControllerGetSessionHealthV1QueryKey,
} from '#lib/api/generated/channel-gateway/channel-gateway';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * How often the WhatsApp session is re-checked.
 *
 * Thirty seconds, because the failure this watches for is *silent*: a logged-out
 * session breaks nothing that logs, so the poll is the only signal there is.
 * The cost is one small request per open integrations tab, and the alternative
 * is finding out from a patient who never got a reply.
 */
const SESSION_POLL_INTERVAL_MS = 30_000;

export function useWhatsappSessionHealth() {
  const query = useApiQuery<WhatsappSessionHealth>({
    queryKey: getChannelGatewayAdminControllerGetSessionHealthV1QueryKey(),
    queryFn: (signal) => channelGatewayAdminControllerGetSessionHealthV1(signal),
    errorMessage: 'Unable to read the WhatsApp session status.',
    options: { retry: false, refetchInterval: SESSION_POLL_INTERVAL_MS },
  });

  return { ...query, session: query.data };
}
