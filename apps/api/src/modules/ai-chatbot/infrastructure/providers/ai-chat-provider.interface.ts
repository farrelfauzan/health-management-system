import {
  ResolvedAiProviderConfig,
  SendChatCompletionInput,
  SendChatCompletionResult,
} from '../ai-provider.types';

/**
 * Normalized contract every provider adapter implements. Adding a vendor
 * means implementing this and registering the adapter in
 * {@link AiProviderRegistry} — the orchestration service never learns wire
 * formats. Adapters receive a fully resolved config (validated by
 * `AiProviderResolverService`) and must map every upstream failure to a typed
 * {@link AiChatbotError}; raw prompts, API keys, and provider payloads must
 * never reach a log line.
 */
export interface AiChatProvider {
  supports(kind: ResolvedAiProviderConfig['providerKind']): boolean;
  sendChatCompletion(
    config: ResolvedAiProviderConfig,
    input: SendChatCompletionInput,
  ): Promise<SendChatCompletionResult>;
}
