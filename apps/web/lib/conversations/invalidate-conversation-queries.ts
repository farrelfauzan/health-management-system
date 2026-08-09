import type { QueryClient } from '@tanstack/react-query';

import {
  getCsAdminControllerGetHandoffSummaryV1QueryKey,
  getCsAdminControllerGetTranscriptV1QueryKey,
  getCsAdminControllerListConversationsV1QueryKey,
} from '#lib/api/generated/customer-service/customer-service';

/**
 * Refetches everything a takeover, release, reply, or block can change.
 *
 * All three keys, and by **prefix** rather than by the exact params: an admin
 * has usually visited several filters, and a conversation that just moved out
 * of `NEEDS_HUMAN` is stale in every cached list at once, not only the one on
 * screen. The badge is included because these are precisely the actions that
 * change the number in the nav — leaving it out would show a queue count that
 * only corrected itself on the next poll.
 */
export async function invalidateConversationQueries(
  queryClient: QueryClient,
  conversationId?: string,
): Promise<void> {
  const [listKeyPrefix] = getCsAdminControllerListConversationsV1QueryKey();
  const [summaryKeyPrefix] = getCsAdminControllerGetHandoffSummaryV1QueryKey();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [listKeyPrefix] }),
    queryClient.invalidateQueries({ queryKey: [summaryKeyPrefix] }),
    ...(conversationId === undefined
      ? []
      : [
          queryClient.invalidateQueries({
            queryKey: [getCsAdminControllerGetTranscriptV1QueryKey(conversationId, {})[0]],
          }),
        ]),
  ]);
}
