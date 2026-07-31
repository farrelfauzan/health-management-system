import { AiChatbotError } from '../ai-chatbot.error';

const MODEL_ERROR_STATUS_CODES: readonly number[] = [400, 404, 422];

/**
 * Maps a delivered-but-unsuccessful HTTP response to a typed adapter error,
 * shared by every adapter because vendors converge on the same status
 * semantics. `errorDetail` is the vendor's own readable reason (already
 * extracted from whichever error envelope the vendor uses) — it is the only
 * upstream text carried through, mirroring the BPJS `metaData.message`
 * precedent, because the admin fixing a config needs the vendor's words.
 * Model errors are detected by the detail text: OpenAI answers 404
 * `model_not_found`, DeepSeek 400 "Model Not Exist", Ollama 404
 * "model … not found", Anthropic 404 "model: …" — a 404 without model talk
 * is a wrong base URL, which is an availability problem, not a model one.
 */
export function mapAiProviderResponseError(status: number, errorDetail: string): AiChatbotError {
  if (status === 401 || status === 403) {
    return new AiChatbotError(
      'AI_PROVIDER_UNAUTHORIZED',
      `AI provider rejected the API key (HTTP ${status})`,
      status,
    );
  }
  if (MODEL_ERROR_STATUS_CODES.includes(status) && /model/i.test(errorDetail)) {
    return new AiChatbotError(
      'AI_PROVIDER_MODEL_NOT_FOUND',
      `AI provider does not recognise the configured model (HTTP ${status}: ${errorDetail})`,
      status,
    );
  }
  return new AiChatbotError(
    'AI_PROVIDER_UNAVAILABLE',
    `AI provider request failed (HTTP ${status}${errorDetail === '' ? '' : `: ${errorDetail}`})`,
    status,
  );
}
