import type { ApiError, ApiErrorFieldIssue } from '@hms/shared-types';

type ZodIssueLike = { message?: unknown; path?: unknown };

/**
 * The per-field issues a refusal carries in `error.details` — the list the
 * API's validation pipe produces, one entry per failed field.
 *
 * Only the list shape is read here. `details` is also used for facts that are
 * not field messages at all (a retry delay, a set of unknown codes), and
 * guessing at those would put "30" under a field called `retryAfterSeconds`.
 */
export function resolveApiErrorIssues(payload: unknown): ApiErrorFieldIssue[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }
  const details = (payload as Partial<ApiError>).error?.details;
  return Array.isArray(details) ? details.flatMap(toFieldIssue) : [];
}

function toFieldIssue(detail: unknown): ApiErrorFieldIssue[] {
  if (typeof detail !== 'object' || detail === null) {
    return [];
  }
  const { message, path } = detail as ZodIssueLike;
  if (typeof message !== 'string' || message.trim() === '') {
    return [];
  }
  return [{ path: Array.isArray(path) ? path.map(String).join('.') : '', message }];
}
