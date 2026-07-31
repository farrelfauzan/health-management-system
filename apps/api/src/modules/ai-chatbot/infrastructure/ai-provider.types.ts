import type { AiProviderKindValue } from '@hms/shared-types';

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
  | 'AI_SAFETY_BLOCKED';

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
