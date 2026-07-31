import type { AiProviderKindValue, ChatChannelValue } from '@hms/shared-types';

/**
 * Adapter-only wire types for the AI provider gateway (deliberately not in
 * `@hms/shared-types` — a decrypted API key must never appear in a shared
 * contract).
 */

/**
 * Typed failure codes for the chatbot module. `AI_NOT_CONFIGURED` covers
 * every flavour of "chat cannot run on this deployment" (no active config, a
 * disabled config, or a missing encryption key); the provider-prefixed codes
 * are mapped from upstream failures by the P13-T04 adapter layer.
 */
export type AiChatbotErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_UNAUTHORIZED'
  | 'AI_PROVIDER_MODEL_NOT_FOUND'
  | 'AI_SAFETY_BLOCKED'
  | 'AI_RATE_LIMITED';

/**
 * The active provider configuration with its API key decrypted, ready for an
 * outbound call. Callers must treat the result as ephemeral — never persist,
 * log, or return it. `apiKey` is null for a keyless upstream (self-hosted
 * Ollama without auth); `baseUrl` is null when the adapter should fall back
 * to the vendor's published base URL. `isEnabled` rides along so the
 * resolver can distinguish "paused by the clinic" from "not configured"
 * without a second query.
 */
export type AiProviderConnection = {
  configId: string;
  providerKind: AiProviderKindValue;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  isEnabled: boolean;
};

/**
 * A connection the resolver has finished validating: the base URL is
 * concrete (vendor default applied or the config rejected), the API key is
 * present for every kind that needs one, and the model string passed the
 * allowlist pattern. This is the only shape adapters accept — an adapter
 * never decides defaults or requiredness itself.
 */
export type ResolvedAiProviderConfig = {
  configId: string;
  providerKind: AiProviderKindValue;
  /** Null only for a keyless self-hosted upstream (`OLLAMA`). */
  apiKey: string | null;
  baseUrl: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
};

export type ChatCompletionRole = 'user' | 'assistant' | 'system';

export type ChatCompletionMessage = {
  role: ChatCompletionRole;
  content: string;
};

/**
 * Normalized request every adapter accepts. `contextPayload` is the redacted
 * HMS context object; v1 adapters do NOT place it on the wire — the
 * orchestration service folds context into `messages` before the call, and
 * the field rides along for adapters that gain native structured-context
 * support later. `sessionExternalId` is the upstream thread id when the
 * provider supports one; both v1 adapters are stateless and ignore it.
 */
export type SendChatCompletionInput = {
  sessionExternalId: string | null;
  channel: ChatChannelValue;
  messages: ReadonlyArray<ChatCompletionMessage>;
  contextPayload: Record<string, unknown>;
};

/**
 * Normalized completion result. `providerRequestId` is the upstream id to
 * quote in a support ticket (empty string when the vendor returned none);
 * `rawMetadata` carries whatever non-sensitive diagnostics the vendor
 * returned (usage counts, finish reason) for the message audit columns.
 */
export type SendChatCompletionResult = {
  content: string;
  providerKind: AiProviderKindValue;
  providerRequestId: string;
  providerMessageId: string | null;
  model: string;
  latencyMs: number;
  rawMetadata: Record<string, unknown>;
};

export type AiProviderCircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type AiProviderCircuitBreakerOptions = {
  failureThreshold: number;
  openDurationMs: number;
  now?: () => number;
};

/** Deployment-level resilience settings shared by every provider call. */
export type AiProviderAdapterConfig = {
  maxRetryAttempts: number;
  retryBaseDelayMs: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerOpenDurationMs: number;
};

/** One JSON POST for {@link AiProviderHttpClient} to execute with resilience. */
export type AiProviderHttpRequest = {
  /** Breaker key — a bad credential must not trip other configs' circuits. */
  configId: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
};

/** The upstream's HTTP response plus how long the successful attempt took. */
export type AiProviderHttpResult = {
  response: Response;
  latencyMs: number;
};
