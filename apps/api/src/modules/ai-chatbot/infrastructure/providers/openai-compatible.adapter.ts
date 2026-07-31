import { Injectable } from '@nestjs/common';

import type { AiProviderKindValue } from '@hms/shared-types';

import { AiChatbotError } from '../../ai-chatbot.error';
import { AiProviderHttpClient } from '../ai-provider-http.client';
import {
  ResolvedAiProviderConfig,
  SendChatCompletionInput,
  SendChatCompletionResult,
} from '../ai-provider.types';
import { mapAiProviderResponseError } from '../map-ai-provider-response-error';
import { AiChatProvider } from './ai-chat-provider.interface';

const AZURE_OPENAI_API_VERSION = '2024-06-01';

type OpenAiWireStrategy = {
  buildUrl: (config: ResolvedAiProviderConfig) => string;
  buildAuthHeaders: (config: ResolvedAiProviderConfig) => Record<string, string>;
};

function buildChatCompletionsUrl(config: ResolvedAiProviderConfig): string {
  return `${config.baseUrl}/chat/completions`;
}

function buildBearerHeaders(config: ResolvedAiProviderConfig): Record<string, string> {
  // Null only ever reaches here for OLLAMA (the resolver enforces the rest):
  // a keyless self-hosted daemon simply gets no Authorization header.
  return config.apiKey === null ? {} : { Authorization: `Bearer ${config.apiKey}` };
}

const BEARER_STRATEGY: OpenAiWireStrategy = {
  buildUrl: buildChatCompletionsUrl,
  buildAuthHeaders: buildBearerHeaders,
};

/**
 * The per-kind differences of the OpenAI wire shape, kept as data. Azure is
 * the outlier: the deployment name lives in the URL path, the API version in
 * a query param, and the key in an `api-key` header instead of a bearer.
 */
const WIRE_STRATEGIES_BY_KIND: Partial<Record<AiProviderKindValue, OpenAiWireStrategy>> = {
  OPENAI: BEARER_STRATEGY,
  DEEPSEEK: BEARER_STRATEGY,
  OLLAMA: BEARER_STRATEGY,
  OPENAI_COMPATIBLE: BEARER_STRATEGY,
  AZURE_OPENAI: {
    buildUrl: (config) =>
      `${config.baseUrl}/openai/deployments/${encodeURIComponent(config.model)}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`,
    buildAuthHeaders: (config) => ({ 'api-key': config.apiKey ?? '' }),
  },
};

type OpenAiChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: string;
  }>;
  usage?: Record<string, unknown>;
  error?: { message?: unknown } | string;
};

/**
 * One adapter for every OpenAI-shaped API: OpenAI itself, DeepSeek, a
 * self-hosted Ollama daemon, any OpenAI-compatible gateway (Groq, Together,
 * LiteLLM), and Azure OpenAI. The differences live in small strategy objects
 * keyed by kind; the completion body and response shape are identical.
 */
@Injectable()
export class OpenAiCompatibleAdapter implements AiChatProvider {
  constructor(private readonly httpClient: AiProviderHttpClient) {}

  supports(kind: AiProviderKindValue): boolean {
    return WIRE_STRATEGIES_BY_KIND[kind] !== undefined;
  }

  async sendChatCompletion(
    config: ResolvedAiProviderConfig,
    input: SendChatCompletionInput,
  ): Promise<SendChatCompletionResult> {
    const strategy = this.resolveStrategy(config.providerKind);
    const { response, latencyMs } = await this.httpClient.sendJsonRequest({
      configId: config.configId,
      url: strategy.buildUrl(config),
      headers: strategy.buildAuthHeaders(config),
      body: {
        model: config.model,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        max_tokens: config.maxTokens,
      },
      timeoutMs: config.timeoutMs,
    });
    const payload = await this.parsePayload(response);
    if (!response.ok) {
      throw mapAiProviderResponseError(response.status, this.readErrorDetail(payload));
    }
    return this.toResult(config, response, payload, latencyMs);
  }

  private resolveStrategy(kind: AiProviderKindValue): OpenAiWireStrategy {
    const strategy = WIRE_STRATEGIES_BY_KIND[kind];
    if (strategy === undefined) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        `OpenAI-compatible adapter does not support provider kind ${kind}`,
      );
    }
    return strategy;
  }

  private async parsePayload(response: Response): Promise<OpenAiChatCompletionResponse> {
    try {
      return (await response.json()) as OpenAiChatCompletionResponse;
    } catch {
      return {};
    }
  }

  /** Handles both error envelopes: OpenAI `{error:{message}}`, Ollama `{error:"…"}`. */
  private readErrorDetail(payload: OpenAiChatCompletionResponse): string {
    if (typeof payload.error === 'string') {
      return payload.error;
    }
    return typeof payload.error?.message === 'string' ? payload.error.message : '';
  }

  private toResult(
    config: ResolvedAiProviderConfig,
    response: Response,
    payload: OpenAiChatCompletionResponse,
    latencyMs: number,
  ): SendChatCompletionResult {
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content === '') {
      throw new AiChatbotError(
        'AI_PROVIDER_UNAVAILABLE',
        'AI provider returned an unexpected completion shape',
        response.status,
      );
    }
    return {
      content,
      providerKind: config.providerKind,
      providerRequestId: response.headers.get('x-request-id') ?? payload.id ?? '',
      providerMessageId: payload.id ?? null,
      model: payload.model ?? config.model,
      latencyMs,
      rawMetadata: {
        ...(payload.usage === undefined ? {} : { usage: payload.usage }),
        ...(payload.choices?.[0]?.finish_reason === undefined
          ? {}
          : { finishReason: payload.choices[0].finish_reason }),
      },
    };
  }
}
