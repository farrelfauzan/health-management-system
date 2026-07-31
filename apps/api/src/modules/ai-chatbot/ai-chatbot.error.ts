import { AiChatbotErrorCode } from './infrastructure/ai-provider.types';

/**
 * Typed failure raised by the AI chatbot module. Domain services and the
 * (P13-T08) controller branch on {@link code}, never on upstream HTTP
 * details; messages never contain API keys, decrypted credentials, or prompt
 * content.
 */
export class AiChatbotError extends Error {
  constructor(
    readonly code: AiChatbotErrorCode,
    message: string,
    readonly upstreamStatusCode?: number,
  ) {
    super(message);
    this.name = 'AiChatbotError';
  }
}
