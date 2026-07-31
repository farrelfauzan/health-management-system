import type { AiProviderKindValue } from '@hms/shared-types';

/**
 * Published vendor base URLs the resolver falls back to when a config leaves
 * `baseUrl` empty. Null means no sensible default exists — the admin must
 * supply the URL (`OPENAI_COMPATIBLE` gateways, Azure resource URLs) and the
 * resolver rejects the config otherwise.
 */
export const DEFAULT_AI_PROVIDER_BASE_URLS: Readonly<Record<AiProviderKindValue, string | null>> = {
  OPENAI: 'https://api.openai.com/v1',
  DEEPSEEK: 'https://api.deepseek.com/v1',
  ANTHROPIC: 'https://api.anthropic.com/v1',
  OLLAMA: 'http://127.0.0.1:11434/v1',
  OPENAI_COMPATIBLE: null,
  AZURE_OPENAI: null,
};
