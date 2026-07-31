import type { QueryClient } from '@tanstack/react-query';

import { getAiProviderControllerListConfigsV1QueryKey } from '#lib/api/generated/ai-chatbot/ai-chatbot';

/**
 * Refetches the provider list after any mutation. Every mutation can change
 * more than the row it targets — activating one config deactivates another,
 * and deleting frees the active slot — so the whole list is invalidated
 * rather than a single entry patched in place.
 */
export async function invalidateAiProviderQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getAiProviderControllerListConfigsV1QueryKey(),
  });
}
