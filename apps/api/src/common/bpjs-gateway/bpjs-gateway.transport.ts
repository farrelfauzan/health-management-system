import { Logger } from '@nestjs/common';

import { BpjsGatewayCircuitBreaker } from './bpjs-gateway-circuit-breaker';
import {
  BpjsGatewayCall,
  BpjsGatewayHttpMethod,
  BpjsGatewayResiliencePolicy,
  BpjsGatewayResponseEnvelope,
  BpjsGatewayServiceProfile,
} from './bpjs-gateway.types';

const IDEMPOTENT_METHODS: readonly BpjsGatewayHttpMethod[] = ['GET', 'PUT', 'DELETE'];
const SUCCESS_META_DATA_CODES: readonly number[] = [200, 201];
const TIMEOUT_ERROR_NAMES: readonly string[] = ['TimeoutError', 'AbortError'];

function readErrorName(caughtError: unknown): string | undefined {
  if (typeof caughtError === 'object' && caughtError !== null && 'name' in caughtError) {
    return String((caughtError as { name: unknown }).name);
  }
  return undefined;
}

/**
 * The request engine shared by every BPJS gateway service adapter: request
 * timeout, exponential-backoff retries for idempotent requests only, a
 * circuit breaker over transport failures, and the success/rejection reading
 * of the BPJS `metaData` envelope.
 *
 * Extracted from the PCare client when Antrean Online arrived (P14-T03)
 * rather than forked, because the two services differ only in their host,
 * their header set, and their error vocabulary — all three of which arrive
 * through {@link BpjsGatewayServiceProfile} and {@link BpjsGatewayCall}. One
 * instance per service, so one service's outage cannot open another's circuit.
 *
 * The protocol coupling the codec pins down lives here too: each attempt
 * signs with a fresh timestamp and decodes the response with that same
 * timestamp, because the response AES key derives from it (ADR D-022).
 */
export class BpjsGatewayTransport {
  private readonly logger: Logger;
  private readonly circuitBreaker: BpjsGatewayCircuitBreaker;

  constructor(
    private readonly profile: BpjsGatewayServiceProfile,
    private readonly policy: BpjsGatewayResiliencePolicy,
  ) {
    this.logger = new Logger(`${profile.serviceLabel} transport`);
    this.circuitBreaker = new BpjsGatewayCircuitBreaker({
      failureThreshold: policy.circuitBreakerFailureThreshold,
      openDurationMs: policy.circuitBreakerOpenDurationMs,
    });
  }

  /** Sends one signed request and returns the decoded response envelope. */
  async sendRequest(call: BpjsGatewayCall): Promise<BpjsGatewayResponseEnvelope> {
    const maxAttempts = this.resolveMaxAttempts(call.request.method);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) {
        await this.delayBeforeRetry(attempt);
      }
      try {
        return await this.executeCall(call);
      } catch (caughtError) {
        if (!this.profile.isRetryableError(caughtError)) {
          throw caughtError;
        }
        lastError = caughtError as Error;
        this.logger.warn(
          `${this.profile.serviceLabel} ${call.request.method} attempt ${attempt}/${maxAttempts} failed with ${this.profile.describeFailure(caughtError)}`,
        );
      }
    }
    throw lastError as Error;
  }

  private resolveMaxAttempts(method: BpjsGatewayHttpMethod): number {
    return IDEMPOTENT_METHODS.includes(method) ? this.policy.maxRetryAttempts + 1 : 1;
  }

  private async delayBeforeRetry(attempt: number): Promise<void> {
    const delayMs = this.policy.retryBaseDelayMs * 2 ** (attempt - 2);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async executeCall(call: BpjsGatewayCall): Promise<BpjsGatewayResponseEnvelope> {
    if (!this.circuitBreaker.canExecute()) {
      throw this.profile.createError(
        'CIRCUIT_OPEN',
        `${this.profile.serviceLabel} circuit breaker is open after repeated upstream failures`,
      );
    }
    try {
      const result = await this.performCall(call);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (caughtError) {
      if (this.profile.isRetryableError(caughtError)) {
        this.circuitBreaker.recordFailure();
      } else if (this.profile.isServiceError(caughtError)) {
        this.circuitBreaker.recordSuccess();
      }
      throw caughtError;
    }
  }

  private async performCall(call: BpjsGatewayCall): Promise<BpjsGatewayResponseEnvelope> {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const response = await this.performFetch(call, timestampSeconds);
    return this.parseResponse(call, response, timestampSeconds);
  }

  private async performFetch(call: BpjsGatewayCall, timestampSeconds: number): Promise<Response> {
    const headers: Record<string, string> = {
      ...call.buildHeaders(timestampSeconds),
      Accept: 'application/json',
    };
    const hasBody = call.request.body !== undefined;
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      return await fetch(this.buildRequestUrl(call), {
        method: call.request.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(call.request.body) } : {}),
        signal: AbortSignal.timeout(this.policy.requestTimeoutMs),
      });
    } catch (caughtError) {
      throw this.mapTransportError(caughtError);
    }
  }

  /**
   * Maps a `fetch` rejection (the request never produced an HTTP response) to
   * a typed adapter error: aborts from `AbortSignal.timeout` become the
   * service's timeout code, everything else (DNS, TLS, connection reset)
   * becomes its unavailable code. Checks the `name` structurally because
   * Node's `DOMException` is not an `instanceof Error`.
   */
  private mapTransportError(caughtError: unknown): Error {
    if (this.profile.isServiceError(caughtError)) {
      return caughtError as Error;
    }
    const errorName = readErrorName(caughtError);
    if (errorName !== undefined && TIMEOUT_ERROR_NAMES.includes(errorName)) {
      return this.profile.createError('TIMEOUT', `${this.profile.serviceLabel} request timed out`);
    }
    return this.profile.createError('UNAVAILABLE', `${this.profile.serviceLabel} is unreachable`);
  }

  private buildRequestUrl(call: BpjsGatewayCall): string {
    const path =
      call.request.path === '' || call.request.path.startsWith('/')
        ? call.request.path
        : `/${call.request.path}`;
    return `${call.baseUrl}${path}`;
  }

  private async parseResponse(
    call: BpjsGatewayCall,
    response: Response,
    timestampSeconds: number,
  ): Promise<BpjsGatewayResponseEnvelope> {
    if (response.status === 401 || response.status === 403) {
      throw this.profile.createError(
        'UNAUTHORIZED',
        `${this.profile.serviceLabel} rejected the request credentials (HTTP ${response.status})`,
        response.status,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw this.profile.createError(
        'UNAVAILABLE',
        `${this.profile.serviceLabel} upstream failure (HTTP ${response.status})`,
        response.status,
      );
    }
    const rawBody = await this.readResponseBody(response);
    const envelope = call.decodeEnvelope({
      rawBody,
      timestampSeconds,
      statusCode: response.status,
    });
    if (!response.ok) {
      throw this.profile.createError(
        'REQUEST_REJECTED',
        `${this.profile.serviceLabel} rejected the request (HTTP ${response.status}: ${envelope.metaData.message})`,
        response.status,
      );
    }
    const normalisedCode = this.normaliseMetaDataCode(envelope.metaData.code);
    if (normalisedCode === null || !SUCCESS_META_DATA_CODES.includes(normalisedCode)) {
      throw this.profile.createError(
        'REQUEST_REJECTED',
        `${this.profile.serviceLabel} rejected the request (code ${String(envelope.metaData.code)}: ${envelope.metaData.message})`,
        response.status,
      );
    }
    return envelope;
  }

  private async readResponseBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      throw this.profile.createError(
        'UNAVAILABLE',
        `${this.profile.serviceLabel} response body could not be read`,
        response.status,
      );
    }
  }

  private normaliseMetaDataCode(code: string | number): number | null {
    const parsed = typeof code === 'number' ? code : Number(code);
    return Number.isInteger(parsed) ? parsed : null;
  }
}
