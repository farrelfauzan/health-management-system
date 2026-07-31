import type { ChatAvailabilityView } from '@hms/shared-types';

import {
  chatControllerGetAvailabilityV1,
  getChatControllerGetAvailabilityV1QueryKey,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Whether chat can answer right now. The client gates its entry points on
 * this rather than discovering the state from a failed send: letting someone
 * type a question and only then telling them the feature is off is the worst
 * ordering available.
 */
export function useChatAvailability(enabled = true) {
  return useApiQuery<ChatAvailabilityView>({
    queryKey: getChatControllerGetAvailabilityV1QueryKey(),
    queryFn: (signal) => chatControllerGetAvailabilityV1(signal),
    errorMessage: 'Unable to check whether the assistant is available.',
    enabled,
    options: { retry: false, staleTime: 60_000 },
  });
}
