import { Injectable } from '@nestjs/common';

import type { AiProviderKindValue } from '@hms/shared-types';

import { AiChatbotError } from '../../ai-chatbot.error';
import { AiProviderHttpClient } from '../ai-provider-http.client';
import {
  ChatCompletionMessage,
  ChatToolCall,
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
  GEMINI: BEARER_STRATEGY,
  OLLAMA: BEARER_STRATEGY,
  OPENAI_COMPATIBLE: BEARER_STRATEGY,
  AZURE_OPENAI: {
    buildUrl: (config) =>
      `${config.baseUrl}/openai/deployments/${encodeURIComponent(config.model)}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`,
    buildAuthHeaders: (config) => ({ 'api-key': config.apiKey ?? '' }),
  },
};

type OpenAiWireToolCall = {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
};

type OpenAiChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: unknown; tool_calls?: OpenAiWireToolCall[] };
    finish_reason?: string;
  }>;
  usage?: Record<string, unknown>;
  error?: { message?: unknown } | string;
};

/**
 * One adapter for every OpenAI-shaped API: OpenAI itself, DeepSeek, Gemini
 * through Google's OpenAI-compatibility endpoint, a self-hosted Ollama
 * daemon, any OpenAI-compatible gateway (Groq, Together, LiteLLM), and Azure
 * OpenAI. The differences live in small strategy objects keyed by kind; the
 * completion body and response shape are identical.
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
        messages: input.messages.map((message) => this.toWireMessage(message)),
        max_tokens: config.maxTokens,
        ...(input.tools === undefined || input.tools.length === 0
          ? {}
          : {
              tools: input.tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
            }),
      },
      timeoutMs: config.timeoutMs,
    });
    const payload = await this.parsePayload(response);
    if (!response.ok) {
      throw mapAiProviderResponseError(response.status, this.readErrorDetail(payload));
    }
    return this.toResult(config, response, payload, latencyMs);
  }

  /**
   * The Mode B replay shapes (§4.6): a `tool` result turn becomes
   * `role: 'tool'` with its `tool_call_id`, and an assistant turn that
   * requested lookups re-serializes its calls with stringified arguments —
   * the OpenAI wire wants JSON-in-a-string there. Plain turns are unchanged.
   */
  private toWireMessage(message: ChatCompletionMessage): Record<string, unknown> {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId ?? '',
        content: message.content,
      };
    }
    if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
      return {
        role: 'assistant',
        content: message.content === '' ? null : message.content,
        tool_calls: (message.toolCalls ?? []).map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
        })),
      };
    }
    return { role: message.role, content: message.content };
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
    const finishReason = payload.choices?.[0]?.finish_reason;
    const content = payload.choices?.[0]?.message?.content;
    const toolCalls = this.readToolCalls(payload);
    const normalizedContent = typeof content === 'string' ? content : '';
    if (normalizedContent === '' && toolCalls.length === 0) {
      // A truncated-to-nothing answer is a budget problem, not a broken
      // vendor, and the two need different fixes from whoever reads the
      // message — so say which one this was rather than "unexpected shape".
      // A tool-call-only reply is neither: content is legitimately empty
      // while the model waits on its lookups.
      throw new AiChatbotError(
        'AI_PROVIDER_UNAVAILABLE',
        finishReason === 'length'
          ? 'AI provider returned no content: the token budget was exhausted before any answer was produced (reasoning models spend max_tokens on hidden thinking — raise the configuration Max tokens)'
          : 'AI provider returned an unexpected completion shape',
        response.status,
      );
    }
    return {
      content: normalizedContent,
      toolCalls,
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

  private readToolCalls(payload: OpenAiChatCompletionResponse): ChatToolCall[] {
    const wireToolCalls = payload.choices?.[0]?.message?.tool_calls ?? [];
    return wireToolCalls
      .filter((wireToolCall) => typeof wireToolCall.function?.name === 'string')
      .map((wireToolCall, index) => ({
        id:
          typeof wireToolCall.id === 'string' && wireToolCall.id !== ''
            ? wireToolCall.id
            : `tool-call-${index}`,
        name: wireToolCall.function?.name as string,
        arguments: this.parseToolArguments(wireToolCall.function?.arguments),
      }));
  }

  /**
   * OpenAI sends arguments as JSON-in-a-string. Unparseable input is passed
   * through raw rather than replaced with `{}` — the registry's Zod
   * validation turns it into `AI_TOOL_INVALID_ARGUMENTS`, which names the
   * actual problem, where an invented empty object would dispatch a call the
   * model never made.
   */
  private parseToolArguments(rawArguments: unknown): unknown {
    if (typeof rawArguments !== 'string') {
      return rawArguments ?? {};
    }
    try {
      return JSON.parse(rawArguments) as unknown;
    } catch {
      return rawArguments;
    }
  }
}
