import type { AiProviderConfigView } from '@hms/shared-types';

import {
  aiProviderControllerListConfigsV1,
  getAiProviderControllerListConfigsV1QueryKey,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The clinic's AI provider configurations. API keys are never in this
 * payload — the API returns only a presence flag and the four-character
 * hint, so nothing here can leak a credential into the browser.
 */
export function useAiProviderConfigs(enabled = true) {
  return useApiQuery<AiProviderConfigView[]>({
    queryKey: getAiProviderControllerListConfigsV1QueryKey(),
    queryFn: (signal) => aiProviderControllerListConfigsV1(signal),
    errorMessage: 'Unable to load AI provider configurations.',
    enabled,
    options: { retry: false },
  });
}
