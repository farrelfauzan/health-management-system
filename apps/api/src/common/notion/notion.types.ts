/**
 * Resolved Notion connector settings (P23-T02). Infrastructure-only: the
 * adapter maps everything to module contracts before it leaves `common/`, so
 * these shapes stay here rather than in `@hms/shared-types`.
 *
 * `isConfigured` is false on a deployment with no Notion variables at all.
 * That is a supported state, not a failure — the bug-report worker leaves its
 * rows queued and burns no attempts (P23-T10).
 */
export type NotionConfig = {
  readonly isConfigured: boolean;
  readonly apiToken?: string;
  /**
   * The Bug Board's data source, not its database: from API version
   * 2025-09-03 a page is created under a data source.
   */
  readonly bugBoardDataSourceId?: string;
  readonly requestTimeoutMs: number;
  readonly maxRequestsPerSecond: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerOpenDurationMs: number;
};

/**
 * How a caller must treat a failed Notion call.
 *
 * - `PERMANENT` — retrying the same request cannot succeed: a rejected
 *   payload, a revoked token, or a board that was never shared with this
 *   integration.
 * - `RETRYABLE` — Notion did not process the request (rate limit, overload,
 *   edit conflict), or the call was a read and can simply be repeated.
 * - `AMBIGUOUS` — a create timed out or failed mid-flight. Page creation is
 *   not idempotent, so the page may already exist; the caller must look it up
 *   by Report ID before creating another (P23-T10).
 */
export type NotionErrorKind = 'PERMANENT' | 'RETRYABLE' | 'AMBIGUOUS';

export type NotionErrorContext = {
  readonly notionCode?: string;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
};

export type NotionCircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type NotionCircuitBreakerOptions = {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
  readonly now?: () => number;
};

export type NotionHttpMethod = 'GET' | 'POST';

/** One request to the Notion REST API, relative to its versioned base URL. */
export type NotionRequest = {
  readonly method: NotionHttpMethod;
  readonly path: string;
  readonly body?: unknown;
  /**
   * Whether a timeout or 5xx leaves the caller unable to tell whether the
   * write landed. True only for page creation.
   */
  readonly isAmbiguousOnFailure: boolean;
};

/** One Notion rich-text object, capped at 2,000 characters by the API. */
export type NotionRichText = {
  readonly type: 'text';
  readonly text: { readonly content: string };
};

/** One paragraph block — the only block shape the bug publisher writes. */
export type NotionParagraphBlock = {
  readonly object: 'block';
  readonly type: 'paragraph';
  readonly paragraph: { readonly rich_text: readonly NotionRichText[] };
};

export type NotionCreatePageRequest = {
  readonly properties: Readonly<Record<string, unknown>>;
  readonly children?: readonly NotionParagraphBlock[];
};

export type NotionQueryDataSourceRequest = {
  readonly filter?: unknown;
  readonly pageSize?: number;
};

/** A created or matched page, reduced to what the publisher records. */
export type NotionPage = {
  readonly id: string;
  readonly url?: string;
};

export type NotionQueryDataSourceResponse = {
  readonly results?: readonly NotionPage[];
  readonly has_more?: boolean;
  readonly next_cursor?: string | null;
};

/** The Bug Board schema as Notion reports it, for the field check (P23-T04). */
export type NotionDataSource = {
  readonly id: string;
  readonly properties?: Readonly<Record<string, { readonly type?: string }>>;
};
