import { Inject, Injectable, Logger } from '@nestjs/common';

import { buildSafeErrorLog } from '../observability/safe-logging';
import { NotionCircuitBreaker } from './notion-circuit-breaker';
import { NOTION_CONFIG } from './notion-config.token';
import { NotionRateLimiter } from './notion-rate-limiter';
import { NotionError } from './notion.error';
import {
  NotionCircuitBreakerState,
  NotionConfig,
  NotionCreatePageRequest,
  NotionDataSource,
  NotionPage,
  NotionQueryDataSourceRequest,
  NotionQueryDataSourceResponse,
  NotionRequest,
} from './notion.types';

const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
/**
 * Pinned in code, not in configuration. The version decides the request shape
 * — `2025-09-03` is where a page's parent became a data source rather than a
 * database — so bumping it is a code change with a test behind it, never a
 * setting an operator can move under a running deployment.
 */
const NOTION_API_VERSION = '2025-09-03';
/** Statuses where Notion demonstrably did not process the request. */
const RATE_LIMIT_STATUS_CODES: readonly number[] = [429, 529];
const MAX_RATE_LIMIT_ATTEMPTS = 3;
const DEFAULT_RETRY_AFTER_MS = 1000;
const TIMEOUT_ERROR_NAMES: readonly string[] = ['TimeoutError', 'AbortError'];
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Notion REST client for the bug-report publisher (P23-T03).
 *
 * Plain `fetch`, no SDK: every integration in this API is written this way,
 * and the official client is ESM-only, which the build cannot take (see the
 * `sanitize-html` pin). Three endpoints are all the connector needs.
 *
 * Owns the cross-cutting policy so callers deal only in {@link NotionError}:
 * the pinned API version, a per-call timeout, the ~3 req/s pacing, a circuit
 * breaker over transport failures, and the retry rule that matters — `429` and
 * `529` are retried here because Notion did not process the request, while a
 * timeout on create is handed back as `AMBIGUOUS` because the page may exist.
 */
@Injectable()
export class NotionHttpClient {
  private readonly logger = new Logger(NotionHttpClient.name);
  private readonly circuitBreaker: NotionCircuitBreaker;
  private readonly rateLimiter: NotionRateLimiter;

  constructor(@Inject(NOTION_CONFIG) private readonly notionConfig: NotionConfig) {
    this.circuitBreaker = new NotionCircuitBreaker({
      failureThreshold: notionConfig.circuitBreakerFailureThreshold,
      openDurationMs: notionConfig.circuitBreakerOpenDurationMs,
    });
    this.rateLimiter = new NotionRateLimiter(notionConfig.maxRequestsPerSecond);
  }

  /** Whether this deployment has Notion credentials at all. */
  isConfigured(): boolean {
    return this.notionConfig.isConfigured;
  }

  /** The pinned API version, for the integrations status card (P23-T04). */
  getApiVersion(): string {
    return NOTION_API_VERSION;
  }

  /** The breaker state in this process, for the integrations status card. */
  getCircuitBreakerState(): NotionCircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  /** Creates one page on the Bug Board. Not idempotent — see {@link NotionError}. */
  async createPage(request: NotionCreatePageRequest): Promise<NotionPage> {
    const dataSourceId = this.requireDataSourceId();
    return this.sendRequest<NotionPage>({
      operation: 'create_page',
      method: 'POST',
      path: '/pages',
      isAmbiguousOnFailure: true,
      body: {
        parent: { type: 'data_source_id', data_source_id: dataSourceId },
        properties: request.properties,
        ...(request.children === undefined ? {} : { children: request.children }),
      },
    });
  }

  /** Queries the Bug Board — the Report-ID lookup the publisher runs first. */
  async queryDataSource(
    request: NotionQueryDataSourceRequest = {},
  ): Promise<NotionQueryDataSourceResponse> {
    const dataSourceId = this.requireDataSourceId();
    return this.sendRequest<NotionQueryDataSourceResponse>({
      operation: 'query_data_source',
      method: 'POST',
      path: `/data_sources/${dataSourceId}/query`,
      isAmbiguousOnFailure: false,
      body: {
        ...(request.filter === undefined ? {} : { filter: request.filter }),
        ...(request.pageSize === undefined ? {} : { page_size: request.pageSize }),
      },
    });
  }

  /** Reads the Bug Board's schema, for the field check (P23-T04). */
  async retrieveDataSource(): Promise<NotionDataSource> {
    const dataSourceId = this.requireDataSourceId();
    return this.sendRequest<NotionDataSource>({
      operation: 'retrieve_data_source',
      method: 'GET',
      path: `/data_sources/${dataSourceId}`,
      isAmbiguousOnFailure: false,
    });
  }

  private requireDataSourceId(): string {
    if (!this.notionConfig.isConfigured || this.notionConfig.bugBoardDataSourceId === undefined) {
      throw new NotionError('PERMANENT', 'Notion is not configured for this deployment', {
        notionCode: 'not_configured',
      });
    }
    return this.notionConfig.bugBoardDataSourceId;
  }

  private async sendRequest<T>(request: NotionRequest): Promise<T> {
    let lastError: NotionError | null = null;
    for (let attempt = 1; attempt <= MAX_RATE_LIMIT_ATTEMPTS; attempt += 1) {
      try {
        return await this.executeRequest<T>(request);
      } catch (caughtError) {
        lastError = caughtError as NotionError;
        if (!this.isRateLimitError(lastError) || attempt === MAX_RATE_LIMIT_ATTEMPTS) {
          throw lastError;
        }
        this.rateLimiter.pauseFor(lastError.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS);
      }
    }
    throw lastError as NotionError;
  }

  private isRateLimitError(caughtError: unknown): boolean {
    return (
      caughtError instanceof NotionError &&
      caughtError.statusCode !== undefined &&
      RATE_LIMIT_STATUS_CODES.includes(caughtError.statusCode)
    );
  }

  private async executeRequest<T>(request: NotionRequest): Promise<T> {
    if (!this.circuitBreaker.canExecute()) {
      throw new NotionError('RETRYABLE', 'Notion circuit breaker is open', {
        notionCode: 'circuit_open',
      });
    }
    await this.rateLimiter.acquire();
    const startedAtEpochMs = Date.now();
    try {
      const response = await this.performFetch(request);
      const result = await this.parseResponse<T>(request, response);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (caughtError) {
      this.recordOutcome(request, caughtError, Date.now() - startedAtEpochMs);
      throw caughtError;
    }
  }

  /**
   * A rejection tells the breaker about reachability, not about the payload.
   * Only a request Notion never answered — a transport failure, a timeout — or
   * one it answered with an unexplained 5xx counts against it. `429` and `529`
   * are Notion answering perfectly well that we are going too fast; the
   * limiter and `Retry-After` handle those, and letting them trip the breaker
   * would shed load Notion never asked us to shed.
   *
   * The log line names the operation, never the path: the path carries the
   * board's data source id. It never carries a request or response body — the
   * body is a bug report.
   */
  private recordOutcome(request: NotionRequest, caughtError: unknown, durationMs: number): void {
    const notionError =
      caughtError instanceof NotionError
        ? caughtError
        : new NotionError('RETRYABLE', 'Notion call failed');
    const hasReachedNotion =
      notionError.statusCode !== undefined &&
      (notionError.statusCode < 500 || RATE_LIMIT_STATUS_CODES.includes(notionError.statusCode));
    if (hasReachedNotion) {
      this.circuitBreaker.recordSuccess();
    } else {
      this.circuitBreaker.recordFailure();
    }
    this.logger.warn(
      buildSafeErrorLog('notion_request_failed', {
        operation: request.operation,
        kind: notionError.kind,
        status: notionError.statusCode ?? null,
        notionCode: notionError.notionCode ?? null,
        durationMs,
      }),
    );
  }

  private async performFetch(request: NotionRequest): Promise<Response> {
    const hasBody = request.body !== undefined;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.notionConfig.apiToken ?? ''}`,
      'Notion-Version': NOTION_API_VERSION,
      Accept: 'application/json',
    };
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      return await fetch(`${NOTION_API_BASE_URL}${request.path}`, {
        method: request.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(this.notionConfig.requestTimeoutMs),
      });
    } catch (caughtError) {
      throw this.mapTransportError(request, caughtError);
    }
  }

  /**
   * A request that never produced a response. On a create this is exactly the
   * dangerous case: Notion may have created the page before the socket died,
   * so the caller is told `AMBIGUOUS` and must look the Report ID up.
   */
  private mapTransportError(request: NotionRequest, caughtError: unknown): NotionError {
    const errorName =
      typeof caughtError === 'object' && caughtError !== null && 'name' in caughtError
        ? String((caughtError as { name: unknown }).name)
        : undefined;
    const hasTimedOut = errorName !== undefined && TIMEOUT_ERROR_NAMES.includes(errorName);
    const message = hasTimedOut ? 'Notion request timed out' : 'Notion is unreachable';
    return new NotionError(request.isAmbiguousOnFailure ? 'AMBIGUOUS' : 'RETRYABLE', message, {
      notionCode: hasTimedOut ? 'timeout' : 'unreachable',
    });
  }

  private async parseResponse<T>(request: NotionRequest, response: Response): Promise<T> {
    if (response.ok) {
      return (await this.readJsonBody(response)) as T;
    }
    throw await this.mapErrorResponse(request, response);
  }

  private async mapErrorResponse(
    request: NotionRequest,
    response: Response,
  ): Promise<NotionError> {
    const notionCode = await this.readErrorCode(response);
    const context = { notionCode, statusCode: response.status };
    if (RATE_LIMIT_STATUS_CODES.includes(response.status)) {
      return new NotionError('RETRYABLE', `Notion rate limited the request (HTTP ${response.status})`, {
        ...context,
        retryAfterMs: this.readRetryAfterMs(response),
      });
    }
    if (response.status === 409) {
      return new NotionError('RETRYABLE', 'Notion reported an edit conflict (HTTP 409)', context);
    }
    if (response.status >= 500) {
      return new NotionError(
        request.isAmbiguousOnFailure ? 'AMBIGUOUS' : 'RETRYABLE',
        `Notion upstream failure (HTTP ${response.status})`,
        context,
      );
    }
    return new NotionError(
      'PERMANENT',
      `Notion rejected the request (HTTP ${response.status})`,
      context,
    );
  }

  /**
   * `Retry-After` is whole seconds; a missing or unparseable one falls back to
   * a second. Read as a string first, because `Number(null)` is 0 — a missing
   * header would otherwise become "retry immediately", which is the one thing
   * a rate limit is telling us not to do.
   */
  private readRetryAfterMs(response: Response): number {
    const rawValue = response.headers.get('Retry-After');
    if (rawValue === null || rawValue.trim() === '') {
      return DEFAULT_RETRY_AFTER_MS;
    }
    const seconds = Number(rawValue);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return DEFAULT_RETRY_AFTER_MS;
    }
    return seconds * MILLISECONDS_PER_SECOND;
  }

  /**
   * Notion's machine-readable error code — `validation_error`,
   * `object_not_found`, `restricted_resource`. The human `message` beside it
   * is deliberately left unread: it can quote the payload, and the payload is
   * a bug report.
   */
  private async readErrorCode(response: Response): Promise<string | undefined> {
    const body = await this.readJsonBody(response);
    if (typeof body === 'object' && body !== null && 'code' in body) {
      const code = (body as { code: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }
    return undefined;
  }

  private async readJsonBody(response: Response): Promise<unknown> {
    return response.json().catch(() => undefined);
  }
}
