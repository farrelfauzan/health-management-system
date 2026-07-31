import { Injectable } from '@nestjs/common';

import type { AiProviderKindValue } from '@hms/shared-types';

import { AiChatbotError } from '../../ai-chatbot.error';
import { AiProviderHttpClient } from '../ai-provider-http.client';
import {
  ChatCompletionMessage,
  ResolvedAiProviderConfig,
  SendChatCompletionInput,
  SendChatCompletionResult,
} from '../ai-provider.types';
import { mapAiProviderResponseError } from '../map-ai-provider-response-error';
import { AiChatProvider } from './ai-chat-provider.interface';

const ANTHROPIC_API_VERSION = '2023-06-01';

type AnthropicMessagesResponse = {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: unknown }>;
  stop_reason?: string;
  usage?: Record<string, unknown>;
  error?: { message?: unknown };
};

/**
 * Adapter for the Anthropic Messages API — separate from the
 * OpenAI-compatible family because Claude takes the system prompt as a
 * top-level `system` field (not a message role), authenticates with
 * `x-api-key` instead of a bearer, and answers with content blocks instead
 * of choices. The normalization back to HMS's result type is total: the
 * orchestration service cannot tell which vendor answered.
 */
@Injectable()
export class AnthropicAdapter implements AiChatProvider {
  constructor(private readonly httpClient: AiProviderHttpClient) {}

  supports(kind: AiProviderKindValue): boolean {
    return kind === 'ANTHROPIC';
  }

  async sendChatCompletion(
    config: ResolvedAiProviderConfig,
    input: SendChatCompletionInput,
  ): Promise<SendChatCompletionResult> {
    const systemPrompt = this.joinSystemMessages(input.messages);
    const { response, latencyMs } = await this.httpClient.sendJsonRequest({
      configId: config.configId,
      url: `${config.baseUrl}/messages`,
      headers: {
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: {
        model: config.model,
        max_tokens: config.maxTokens,
        messages: input.messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({ role: message.role, content: message.content })),
        ...(systemPrompt === '' ? {} : { system: systemPrompt }),
      },
      timeoutMs: config.timeoutMs,
    });
    const payload = await this.parsePayload(response);
    if (!response.ok) {
      throw mapAiProviderResponseError(response.status, this.readErrorDetail(payload));
    }
    return this.toResult(config, response, payload, latencyMs);
  }

  private joinSystemMessages(messages: ReadonlyArray<ChatCompletionMessage>): string {
    return messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
  }

  private async parsePayload(response: Response): Promise<AnthropicMessagesResponse> {
    try {
      return (await response.json()) as AnthropicMessagesResponse;
    } catch {
      return {};
    }
  }

  private readErrorDetail(payload: AnthropicMessagesResponse): string {
    return typeof payload.error?.message === 'string' ? payload.error.message : '';
  }

  private toResult(
    config: ResolvedAiProviderConfig,
    response: Response,
    payload: AnthropicMessagesResponse,
    latencyMs: number,
  ): SendChatCompletionResult {
    const content = (payload.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');
    if (content === '') {
      throw new AiChatbotError(
        'AI_PROVIDER_UNAVAILABLE',
        'AI provider returned an unexpected completion shape',
        response.status,
      );
    }
    return {
      content,
      providerKind: config.providerKind,
      providerRequestId: response.headers.get('request-id') ?? payload.id ?? '',
      providerMessageId: payload.id ?? null,
      model: payload.model ?? config.model,
      latencyMs,
      rawMetadata: {
        ...(payload.usage === undefined ? {} : { usage: payload.usage }),
        ...(payload.stop_reason === undefined ? {} : { stopReason: payload.stop_reason }),
      },
    };
  }
}
