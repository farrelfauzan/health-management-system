import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BpjsPcareCircuitBreaker } from './bpjs-pcare-circuit-breaker';
import { BpjsPcareCodecError } from './bpjs-pcare-codec.error';
import { BpjsPcareError } from './bpjs-pcare.error';
import { resolveBpjsPcareAdapterConfig } from './bpjs-pcare.config';
import {
  BpjsPcareAdapterConfig,
  BpjsPcareConnection,
  BpjsPcareHttpMethod,
  BpjsPcareRequest,
  BpjsPcareResponseEnvelope,
} from './bpjs-pcare.types';
import { buildBpjsPcareHeaders } from './build-bpjs-pcare-headers';
import { decodeBpjsPcareResponse } from './decode-bpjs-pcare-response';
import { mapBpjsPcareTransportError } from './map-bpjs-pcare-transport-error';

const IDEMPOTENT_METHODS: readonly BpjsPcareHttpMethod[] = ['GET', 'PUT', 'DELETE'];
const RETRYABLE_ERROR_CODES: readonly string[] = ['BPJS_PCARE_TIMEOUT', 'BPJS_PCARE_UNAVAILABLE'];
const SUCCESS_META_DATA_CODES: readonly number[] = [200, 201];

/**
 * Signed HTTP client for the BPJS PCare REST v3.0 gateway. Owns the
 * cross-cutting resilience policy — request timeout, exponential-backoff
 * retries for idempotent requests only, and a circuit breaker over transport
 * failures — plus the protocol coupling the codec pins down: each attempt
 * signs with a fresh timestamp and decodes the response with that same
 * timestamp, because the response AES key derives from it (ADR D-022).
 * Credentials arrive per call in {@link BpjsPcareConnection} — they are
 * per-facility database rows, not deployment configuration.
 */
@Injectable()
export class BpjsPcareHttpClient {
  private readonly logger = new Logger(BpjsPcareHttpClient.name);
  private readonly adapterConfig: BpjsPcareAdapterConfig;
  private readonly circuitBreaker: BpjsPcareCircuitBreaker;

  constructor(configService: ConfigService) {
    this.adapterConfig = resolveBpjsPcareAdapterConfig(configService);
    this.circuitBreaker = new BpjsPcareCircuitBreaker({
      failureThreshold: this.adapterConfig.circuitBreakerFailureThreshold,
      openDurationMs: this.adapterConfig.circuitBreakerOpenDurationMs,
    });
  }

  /** Sends one signed request and returns the decoded response envelope. */
  async sendRequest(
    connection: BpjsPcareConnection,
    request: BpjsPcareRequest,
  ): Promise<BpjsPcareResponseEnvelope> {
    const maxAttempts = this.resolveMaxAttempts(request.method);
    let lastError: BpjsPcareError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) {
        await this.delayBeforeRetry(attempt);
      }
      try {
        return await this.executeRequest(connection, request);
      } catch (caughtError) {
        if (!this.isRetryableError(caughtError)) {
          throw caughtError;
        }
        lastError = caughtError as BpjsPcareError;
        this.logger.warn(
          `BPJS PCare ${request.method} ${request.path} attempt ${attempt}/${maxAttempts} failed with ${lastError.code}`,
        );
      }
    }
    throw lastError as BpjsPcareError;
  }

  private resolveMaxAttempts(method: BpjsPcareHttpMethod): number {
    return IDEMPOTENT_METHODS.includes(method) ? this.adapterConfig.maxRetryAttempts + 1 : 1;
  }

  private isRetryableError(caughtError: unknown): boolean {
    return (
      caughtError instanceof BpjsPcareError && RETRYABLE_ERROR_CODES.includes(caughtError.code)
    );
  }

  private async delayBeforeRetry(attempt: number): Promise<void> {
    const delayMs = this.adapterConfig.retryBaseDelayMs * 2 ** (attempt - 2);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async executeRequest(
    connection: BpjsPcareConnection,
    request: BpjsPcareRequest,
  ): Promise<BpjsPcareResponseEnvelope> {
    if (!this.circuitBreaker.canExecute()) {
      throw new BpjsPcareError(
        'BPJS_PCARE_CIRCUIT_OPEN',
        'BPJS PCare circuit breaker is open after repeated upstream failures',
      );
    }
    try {
      const result = await this.performRequest(connection, request);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (caughtError) {
      if (this.isRetryableError(caughtError)) {
        this.circuitBreaker.recordFailure();
      } else if (caughtError instanceof BpjsPcareError) {
        this.circuitBreaker.recordSuccess();
      }
      throw caughtError;
    }
  }

  private async performRequest(
    connection: BpjsPcareConnection,
    request: BpjsPcareRequest,
  ): Promise<BpjsPcareResponseEnvelope> {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const response = await this.performFetch(connection, request, timestampSeconds);
    return this.parseResponse(connection, response, timestampSeconds);
  }

  private async performFetch(
    connection: BpjsPcareConnection,
    request: BpjsPcareRequest,
    timestampSeconds: number,
  ): Promise<Response> {
    const signedHeaders = buildBpjsPcareHeaders({
      credentials: connection.credentials,
      timestampSeconds,
    });
    const headers: Record<string, string> = { ...signedHeaders, Accept: 'application/json' };
    const hasBody = request.body !== undefined;
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      return await fetch(this.buildRequestUrl(connection, request), {
        method: request.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(this.adapterConfig.requestTimeoutMs),
      });
    } catch (caughtError) {
      throw mapBpjsPcareTransportError(caughtError);
    }
  }

  private buildRequestUrl(connection: BpjsPcareConnection, request: BpjsPcareRequest): string {
    const baseUrl =
      connection.environment === 'PRODUCTION'
        ? this.adapterConfig.productionBaseUrl
        : this.adapterConfig.developmentBaseUrl;
    const path =
      request.path === '' || request.path.startsWith('/') ? request.path : `/${request.path}`;
    return `${baseUrl}${path}`;
  }

  private async parseResponse(
    connection: BpjsPcareConnection,
    response: Response,
    timestampSeconds: number,
  ): Promise<BpjsPcareResponseEnvelope> {
    if (response.status === 401 || response.status === 403) {
      throw new BpjsPcareError(
        'BPJS_PCARE_UNAUTHORIZED',
        `BPJS PCare rejected the request credentials (HTTP ${response.status})`,
        response.status,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new BpjsPcareError(
        'BPJS_PCARE_UNAVAILABLE',
        `BPJS PCare upstream failure (HTTP ${response.status})`,
        response.status,
      );
    }
    const rawBody = await this.readResponseBody(response);
    const envelope = this.decodeEnvelope(connection, rawBody, timestampSeconds, response.status);
    if (!response.ok) {
      throw new BpjsPcareError(
        'BPJS_PCARE_REQUEST_REJECTED',
        `BPJS PCare rejected the request (HTTP ${response.status}: ${envelope.metaData.message})`,
        response.status,
      );
    }
    const normalisedCode = this.normaliseMetaDataCode(envelope.metaData.code);
    if (normalisedCode === null || !SUCCESS_META_DATA_CODES.includes(normalisedCode)) {
      throw new BpjsPcareError(
        'BPJS_PCARE_REQUEST_REJECTED',
        `BPJS PCare rejected the request (code ${String(envelope.metaData.code)}: ${envelope.metaData.message})`,
        response.status,
      );
    }
    return envelope;
  }

  private async readResponseBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      throw new BpjsPcareError(
        'BPJS_PCARE_UNAVAILABLE',
        'BPJS PCare response body could not be read',
        response.status,
      );
    }
  }

  private decodeEnvelope(
    connection: BpjsPcareConnection,
    rawBody: string,
    timestampSeconds: number,
    statusCode: number,
  ): BpjsPcareResponseEnvelope {
    try {
      return decodeBpjsPcareResponse({
        context: {
          consId: connection.credentials.consId,
          secretKey: connection.credentials.secretKey,
          timestamp: String(timestampSeconds),
        },
        rawBody,
      });
    } catch (caughtError) {
      if (caughtError instanceof BpjsPcareCodecError) {
        throw new BpjsPcareError(caughtError.code, caughtError.message, statusCode);
      }
      throw caughtError;
    }
  }

  private normaliseMetaDataCode(code: string | number): number | null {
    const parsed = typeof code === 'number' ? code : Number(code);
    return Number.isInteger(parsed) ? parsed : null;
  }
}
