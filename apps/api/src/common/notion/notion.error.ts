import { NotionErrorContext, NotionErrorKind } from './notion.types';

/**
 * Typed failure raised by the Notion adapter (P23-T03). Callers branch on
 * {@link kind}, never on the upstream status.
 *
 * `AMBIGUOUS` is the one that shapes the publisher: creating a page is not
 * idempotent, so a timeout or a 5xx on create leaves the page possibly
 * created. Retrying blindly is how a board ends up with two tickets for one
 * report, which is why the client refuses to retry that case itself and the
 * caller must look the Report ID up first.
 *
 * The message carries the HTTP status and Notion's own error code and nothing
 * else. A Notion error body can echo the payload, and the payload is a bug
 * report — user-written text that has already been redacted once and must not
 * be redacted again by accident in a log line.
 */
export class NotionError extends Error {
  readonly notionCode?: string;
  readonly statusCode?: number;
  /** How long Notion asked us to wait, from `Retry-After`, when it did. */
  readonly retryAfterMs?: number;

  constructor(
    readonly kind: NotionErrorKind,
    message: string,
    context: NotionErrorContext = {},
  ) {
    super(message);
    this.name = 'NotionError';
    this.notionCode = context.notionCode;
    this.statusCode = context.statusCode;
    this.retryAfterMs = context.retryAfterMs;
  }
}
