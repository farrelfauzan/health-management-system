import type { ConversationHandoffSummaryView } from '@hms/shared-types';

import {
  csAdminControllerGetHandoffSummaryV1,
  getCsAdminControllerGetHandoffSummaryV1QueryKey,
} from '#lib/api/generated/customer-service/customer-service';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The nav badge's poll.
 *
 * Slower than either screen's, because this one runs on *every* admin page for
 * the whole shift: it is the notification affordance the handoff queue needs,
 * and a customer waiting thirty extra seconds for someone to notice is a much
 * smaller cost than every open tab in the clinic asking the API a question
 * every five.
 */
const HANDOFF_SUMMARY_POLL_INTERVAL_MS = 30_000;

export function useConversationHandoffSummary(enabled: boolean) {
  const query = useApiQuery<ConversationHandoffSummaryView>({
    queryKey: getCsAdminControllerGetHandoffSummaryV1QueryKey(),
    queryFn: (signal) => csAdminControllerGetHandoffSummaryV1(signal),
    errorMessage: 'Unable to load the handoff queue.',
    enabled,
    options: { retry: false, refetchInterval: HANDOFF_SUMMARY_POLL_INTERVAL_MS },
  });

  return { ...query, summary: query.data };
}
