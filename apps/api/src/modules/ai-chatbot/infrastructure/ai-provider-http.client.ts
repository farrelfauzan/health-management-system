import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiChatbotError } from '../ai-chatbot.error';
import { resolveAiProviderAdapterConfig } from './ai-provider-adapter.config';
import { AiProviderCircuitBreaker } from './ai-provider-circuit-breaker';
import {
  AiProviderAdapterConfig,
  AiProviderHttpRequest,
  AiProviderHttpResult,
} from './ai-provider.types';
import { mapAiProviderTransportError } from './map-ai-provider-transport-error';

/**
 * Resilient JSON POST executor shared by every provider adapter. Owns the
 * cross-cutting policy so adapters stay pure translators: per-request
 * timeout from the clinic's config, a single backoff retry for *unreachable*
 * transport errors only (a timed-out completion may already have been
 * processed and the user is waiting synchronously — never retried; 401/403
 * are HTTP responses and never reach the retry path), and a circuit breaker
 * **per config id**, so one clinic's dead upstream or bad key cannot trip
 * another clinic's circuit. Any HTTP response — success or rejection —
 * records the upstream as reachable. URLs, headers, and bodies pass through
 * untouched and are never logged.
 */
@Injectable()
export class AiProviderHttpClient {
  private readonly logger = new Logger(AiProviderHttpClient.name);
  private readonly adapterConfig: AiProviderAdapterConfig;
  private readonly circuitBreakersByConfigId = new Map<string, AiProviderCircuitBreaker>();

  constructor(configService: ConfigService) {
    this.adapterConfig = resolveAiProviderAdapterConfig(configService);
  }

  /** Executes one JSON POST and returns the raw response with its latency. */
  async sendJsonRequest(request: AiProviderHttpRequest): Promise<AiProviderHttpResult> {
    const maxAttempts = this.adapterConfig.maxRetryAttempts + 1;
    let lastError: AiChatbotError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) {
        await this.delayBeforeRetry(attempt);
      }
      try {
        return await this.executeAttempt(request);
      } catch (caughtError) {
        if (!this.isRetryableError(caughtError)) {
          throw caughtError;
        }
        lastError = caughtError as AiChatbotError;
        this.logger.warn(
          `AI provider attempt ${attempt}/${maxAttempts} failed with ${lastError.code}`,
        );
      }
    }
    throw lastError as AiChatbotError;
  }

  private isRetryableError(caughtError: unknown): boolean {
    // Only "the request never got out" is safe to repeat: a timeout may have
    // been processed upstream, and any HTTP status is a delivered answer.
    return (
      caughtError instanceof AiChatbotError &&
      caughtError.code === 'AI_PROVIDER_UNAVAILABLE' &&
      caughtError.upstreamStatusCode === undefined
    );
  }

  private async delayBeforeRetry(attempt: number): Promise<void> {
    const delayMs = this.adapterConfig.retryBaseDelayMs * 2 ** (attempt - 2);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async executeAttempt(request: AiProviderHttpRequest): Promise<AiProviderHttpResult> {
    const circuitBreaker = this.resolveCircuitBreaker(request.configId);
    if (!circuitBreaker.canExecute()) {
      throw new AiChatbotError(
        'AI_PROVIDER_UNAVAILABLE',
        'AI provider circuit breaker is open after repeated upstream failures',
      );
    }
    const startedAtEpochMs = Date.now();
    try {
      const response = await this.performFetch(request);
      circuitBreaker.recordSuccess();
      return { response, latencyMs: Date.now() - startedAtEpochMs };
    } catch (caughtError) {
      circuitBreaker.recordFailure();
      throw caughtError;
    }
  }

  private async performFetch(request: AiProviderHttpRequest): Promise<Response> {
    try {
      return await fetch(request.url, {
        method: 'POST',
        headers: {
          ...request.headers,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (caughtError) {
      throw mapAiProviderTransportError(caughtError);
    }
  }

  private resolveCircuitBreaker(configId: string): AiProviderCircuitBreaker {
    const existingBreaker = this.circuitBreakersByConfigId.get(configId);
    if (existingBreaker !== undefined) {
      return existingBreaker;
    }
    const createdBreaker = new AiProviderCircuitBreaker({
      failureThreshold: this.adapterConfig.circuitBreakerFailureThreshold,
      openDurationMs: this.adapterConfig.circuitBreakerOpenDurationMs,
    });
    this.circuitBreakersByConfigId.set(configId, createdBreaker);
    return createdBreaker;
  }
}
