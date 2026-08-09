import type { AdminConversationView } from '@hms/shared-types';

import {
  csAdminControllerListConversationsV1,
  getCsAdminControllerListConversationsV1QueryKey,
} from '#lib/api/generated/customer-service/customer-service';
import type { CsAdminControllerListConversationsV1Params } from '#lib/api/generated/model/csAdminControllerListConversationsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * How often the inbox re-reads itself.
 *
 * This screen is a queue somebody watches while doing something else, and the
 * events it shows arrive from outside the browser entirely — a customer
 * messaging a bot. Without a poll an admin would sit in front of a list that
 * silently stopped being true the moment they opened it. Ten seconds is the
 * same order as the badge's interval and well under the wait a person on
 * WhatsApp will tolerate.
 */
const CONVERSATION_POLL_INTERVAL_MS = 10_000;

export function useConversations(params: CsAdminControllerListConversationsV1Params) {
  const query = useApiQuery<AdminConversationView[]>({
    queryKey: getCsAdminControllerListConversationsV1QueryKey(params),
    queryFn: (signal) => csAdminControllerListConversationsV1(params, signal),
    errorMessage: 'Unable to load channel conversations.',
    options: { retry: false, refetchInterval: CONVERSATION_POLL_INTERVAL_MS },
  });

  return { ...query, conversations: query.data ?? [] };
}
