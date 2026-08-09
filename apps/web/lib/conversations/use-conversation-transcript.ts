import type { AdminConversationTranscriptView } from '@hms/shared-types';

import {
  csAdminControllerGetTranscriptV1,
  getCsAdminControllerGetTranscriptV1QueryKey,
} from '#lib/api/generated/customer-service/customer-service';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * A live transcript polls faster than the inbox that lists it.
 *
 * The two screens answer different questions. The inbox asks "is anything
 * waiting", which tolerates being ten seconds stale; an open transcript is a
 * conversation someone is *in*, and a reply that shows up five seconds late
 * makes the admin type over the customer.
 */
const TRANSCRIPT_POLL_INTERVAL_MS = 5_000;

export function useConversationTranscript(conversationId: string) {
  const params = {};
  const query = useApiQuery<AdminConversationTranscriptView>({
    queryKey: getCsAdminControllerGetTranscriptV1QueryKey(conversationId, params),
    queryFn: (signal) => csAdminControllerGetTranscriptV1(conversationId, params, signal),
    errorMessage: 'Unable to load the transcript.',
    options: { retry: false, refetchInterval: TRANSCRIPT_POLL_INTERVAL_MS },
  });

  return { ...query, transcript: query.data };
}
