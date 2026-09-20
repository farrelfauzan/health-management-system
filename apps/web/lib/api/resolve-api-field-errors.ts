import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

import { resolveApiErrorIssues } from '#lib/api/resolve-api-error-issues';

/**
 * The field → message map a refusal carries, so a form can show it under the
 * input that caused it rather than as one more line of toast.
 *
 * Two shapes reach here, and both mean the same thing: the validation pipe's
 * issue list (`[{ path: ['nitku'], message }]`) and the hand-built map a
 * service throws (`errors: { nitku: message }`). The first message per field
 * wins, and a field a form does not render is simply never looked up.
 */
export function resolveApiFieldErrors(error: unknown): Record<string, string> {
  const payload: unknown = isAxiosError(error) ? error.response?.data : undefined;
  const fieldErrors: Record<string, string> = {};
  for (const issue of resolveApiErrorIssues(payload)) {
    if (issue.path !== '' && fieldErrors[issue.path] === undefined) {
      fieldErrors[issue.path] = issue.message;
    }
  }
  for (const [field, message] of readDetailEntries(payload)) {
    if (fieldErrors[field] === undefined) {
      fieldErrors[field] = message;
    }
  }
  return fieldErrors;
}

/** The `{ field: message }` shape, keeping only entries that are messages. */
function readDetailEntries(payload: unknown): Array<[string, string]> {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }
  const details = (payload as Partial<ApiError>).error?.details;
  if (Array.isArray(details) || typeof details !== 'object' || details === null) {
    return [];
  }
  return Object.entries(details).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '',
  );
}
