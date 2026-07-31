import { Injectable } from '@nestjs/common';

import type { AiProviderKindValue } from '@hms/shared-types';

import { AiChatbotError } from '../../ai-chatbot.error';
import { AiChatProvider } from './ai-chat-provider.interface';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAiCompatibleAdapter } from './openai-compatible.adapter';

/**
 * Maps an `AiProviderKind` to the adapter that speaks its wire protocol.
 * Adding a vendor means implementing {@link AiChatProvider} and listing the
 * adapter here — nothing in the orchestration or resolver layer changes. The
 * miss case is typed `AI_NOT_CONFIGURED` rather than a crash: a database
 * enum value without a registered adapter reads as "this deployment cannot
 * serve that config", which is exactly what the chat endpoint should say.
 */
@Injectable()
export class AiProviderRegistry {
  private readonly adapters: readonly AiChatProvider[];

  constructor(
    openAiCompatibleAdapter: OpenAiCompatibleAdapter,
    anthropicAdapter: AnthropicAdapter,
  ) {
    this.adapters = [openAiCompatibleAdapter, anthropicAdapter];
  }

  resolveAdapter(kind: AiProviderKindValue): AiChatProvider {
    const adapter = this.adapters.find((candidate) => candidate.supports(kind));
    if (adapter === undefined) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        `No AI provider adapter is registered for provider kind ${kind}`,
      );
    }
    return adapter;
  }
}
