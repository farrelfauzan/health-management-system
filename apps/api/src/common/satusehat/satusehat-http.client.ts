import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { mapSatusehatTransportError } from './map-satusehat-transport-error';
import { SatusehatCircuitBreaker } from './satusehat-circuit-breaker';
import { SatusehatTokenClient } from './satusehat-token.client';
import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import { SatusehatConfig, SatusehatHttpMethod, SatusehatRequest } from './satusehat.types';

const IDEMPOTENT_METHODS: readonly SatusehatHttpMethod[] = ['GET', 'PUT', 'DELETE'];
const RETRYABLE_ERROR_CODES: readonly string[] = ['SATUSEHAT_TIMEOUT', 'SATUSEHAT_UNAVAILABLE'];

/**
 * Authenticated HTTP client for the SATUSEHAT FHIR gateway. Owns the
 * cross-cutting resilience policy — request timeout, exponential-backoff
 * retries for idempotent requests only, one transparent token refresh on 401,
 * and a circuit breaker over transport failures — so callers (master-data
 * lookups, the submission worker) only deal in typed {@link SatusehatError}s.
 */
@Injectable()
export class SatusehatHttpClient {
  private readonly logger = new Logger(SatusehatHttpClient.name);
  private readonly satusehatConfig: SatusehatConfig;
  private readonly circuitBreaker: SatusehatCircuitBreaker;

  constructor(
    configService: ConfigService,
    private readonly tokenClient: SatusehatTokenClient,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
    this.circuitBreaker = new SatusehatCircuitBreaker({
      failureThreshold: this.satusehatConfig.circuitBreakerFailureThreshold,
      openDurationMs: this.satusehatConfig.circuitBreakerOpenDurationMs,
    });
  }

  /** Sends one request to the FHIR gateway and returns the parsed JSON body. */
  async sendRequest<T>(request: SatusehatRequest): Promise<T> {
    if (!this.satusehatConfig.isConfigured) {
      throw new SatusehatError(
        'SATUSEHAT_NOT_CONFIGURED',
        'SATUSEHAT credentials are not configured for this deployment',
      );
    }
    const maxAttempts = this.resolveMaxAttempts(request.method);
    let lastError: SatusehatError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) {
        await this.delayBeforeRetry(attempt);
      }
      try {
        return await this.executeRequest<T>(request);
      } catch (caughtError) {
        if (!this.isRetryableError(caughtError)) {
          throw caughtError;
        }
        lastError = caughtError as SatusehatError;
        this.logger.warn(
          `SATUSEHAT ${request.method} attempt ${attempt}/${maxAttempts} failed with ${lastError.code}`,
        );
      }
    }
    throw lastError as SatusehatError;
  }

  private resolveMaxAttempts(method: SatusehatHttpMethod): number {
    return IDEMPOTENT_METHODS.includes(method) ? this.satusehatConfig.maxRetryAttempts + 1 : 1;
  }

  private isRetryableError(caughtError: unknown): boolean {
    return (
      caughtError instanceof SatusehatError && RETRYABLE_ERROR_CODES.includes(caughtError.code)
    );
  }

  private async delayBeforeRetry(attempt: number): Promise<void> {
    const delayMs = this.satusehatConfig.retryBaseDelayMs * 2 ** (attempt - 2);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async executeRequest<T>(request: SatusehatRequest): Promise<T> {
    if (!this.circuitBreaker.canExecute()) {
      throw new SatusehatError(
        'SATUSEHAT_CIRCUIT_OPEN',
        'SATUSEHAT circuit breaker is open after repeated upstream failures',
      );
    }
    try {
      const result = await this.performRequestWithTokenRefresh<T>(request);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (caughtError) {
      if (this.isRetryableError(caughtError)) {
        this.circuitBreaker.recordFailure();
      } else if (caughtError instanceof SatusehatError) {
        this.circuitBreaker.recordSuccess();
      }
      throw caughtError;
    }
  }

  private async performRequestWithTokenRefresh<T>(request: SatusehatRequest): Promise<T> {
    const accessToken = await this.tokenClient.getAccessToken();
    const response = await this.performFetch(request, accessToken);
    if (response.status !== 401) {
      return this.parseResponse<T>(response);
    }
    this.tokenClient.invalidateToken();
    const freshAccessToken = await this.tokenClient.getAccessToken();
    const retriedResponse = await this.performFetch(request, freshAccessToken);
    return this.parseResponse<T>(retriedResponse);
  }

  private async performFetch(request: SatusehatRequest, accessToken: string): Promise<Response> {
    const requestUrl = this.buildRequestUrl(request);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
    const hasBody = request.body !== undefined;
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      return await fetch(requestUrl, {
        method: request.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(this.satusehatConfig.requestTimeoutMs),
      });
    } catch (caughtError) {
      throw mapSatusehatTransportError(caughtError);
    }
  }

  private buildRequestUrl(request: SatusehatRequest): string {
    const path =
      request.path === '' || request.path.startsWith('/') ? request.path : `/${request.path}`;
    const queryString = request.query ? new URLSearchParams(request.query).toString() : '';
    const querySuffix = queryString === '' ? '' : `?${queryString}`;
    return `${this.satusehatConfig.fhirBaseUrl}${path}${querySuffix}`;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (response.status === 401 || response.status === 403) {
      throw new SatusehatError(
        'SATUSEHAT_UNAUTHORIZED',
        `SATUSEHAT rejected the request credentials (HTTP ${response.status})`,
        response.status,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        `SATUSEHAT upstream failure (HTTP ${response.status})`,
        response.status,
      );
    }
    if (!response.ok) {
      throw new SatusehatError(
        'SATUSEHAT_REQUEST_REJECTED',
        `SATUSEHAT rejected the request (HTTP ${response.status})`,
        response.status,
      );
    }
    if (response.status === 204) {
      return undefined as T;
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT returned a malformed response body',
        response.status,
      );
    }
  }
}
