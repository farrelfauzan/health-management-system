import type { AiProviderKindValue } from '@hms/shared-types';

/**
 * Per-kind model-id hints for the admin form. Placeholders only — the value
 * an admin types must exist on their own account or host, so these show the
 * expected *shape* rather than a list HMS could keep current.
 */
export const AI_PROVIDER_MODEL_PLACEHOLDERS: Readonly<Record<AiProviderKindValue, string>> = {
  OPENAI: 'gpt-4o-mini',
  DEEPSEEK: 'deepseek-chat',
  ANTHROPIC: 'claude-sonnet-4-20250514',
  GEMINI: 'gemini-3.6-flash',
  OLLAMA: 'llama3.2',
  OPENAI_COMPATIBLE: 'model-id-from-your-gateway',
  AZURE_OPENAI: 'your-deployment-name',
};
