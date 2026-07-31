import { AiChatbotError } from '../ai-chatbot.error';

const TIMEOUT_ERROR_NAMES: readonly string[] = ['TimeoutError', 'AbortError'];

function readErrorName(caughtError: unknown): string | undefined {
  if (typeof caughtError === 'object' && caughtError !== null && 'name' in caughtError) {
    return String((caughtError as { name: unknown }).name);
  }
  return undefined;
}

/**
 * Maps a `fetch` rejection (the request never produced an HTTP response) to a
 * typed adapter error: aborts from `AbortSignal.timeout` become
 * `AI_PROVIDER_TIMEOUT`, everything else (DNS, TLS, connection reset)
 * becomes `AI_PROVIDER_UNAVAILABLE`. Checks the `name` structurally because
 * Node's `DOMException` is not an `instanceof Error`.
 */
export function mapAiProviderTransportError(caughtError: unknown): AiChatbotError {
  if (caughtError instanceof AiChatbotError) {
    return caughtError;
  }
  const errorName = readErrorName(caughtError);
  if (errorName !== undefined && TIMEOUT_ERROR_NAMES.includes(errorName)) {
    return new AiChatbotError('AI_PROVIDER_TIMEOUT', 'AI provider request timed out');
  }
  return new AiChatbotError('AI_PROVIDER_UNAVAILABLE', 'AI provider is unreachable');
}
