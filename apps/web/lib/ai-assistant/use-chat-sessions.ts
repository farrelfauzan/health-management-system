import type { ChatSessionView } from '@hms/shared-types';

import {
  chatControllerListSessionsV1,
  getChatControllerListSessionsV1QueryKey,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The signed-in user's own chat sessions, backing the sidebar's recent-
 * consultation list. `retry: false` because the common failure here is a
 * deliberate one — chat disabled on the deployment answers 503 — and
 * retrying a policy decision only delays the empty state.
 */
export function useChatSessions(enabled = true) {
  return useApiQuery<ChatSessionView[]>({
    queryKey: getChatControllerListSessionsV1QueryKey(),
    queryFn: (signal) => chatControllerListSessionsV1(undefined, signal),
    errorMessage: 'Unable to load your chat sessions.',
    enabled,
    options: { retry: false },
  });
}
