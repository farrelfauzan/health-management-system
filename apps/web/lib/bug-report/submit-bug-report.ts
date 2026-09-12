import type { AxiosError } from 'axios';
import {
  BugReportSubmissionView,
  CreateBugReportInput,
  SENSITIVE_DATA_DETECTED,
} from '@hms/shared-types';

import { bugReportControllerSubmitReportV1 } from '#lib/api/generated/bug-reports/bug-reports';
import { parseApiSuccess } from '#lib/api/response';

/**
 * A server-side sensitive-data refusal, resolved to the field it belongs on.
 *
 * The API sends `errors: [{ path, category }]` alongside the coded message
 * (P23-T08), and the field matters: the reporter has four boxes open and "this
 * looks like sensitive data" without a field is a puzzle rather than an
 * instruction.
 */
export type SensitiveDataFieldError = {
  readonly field: string;
  readonly category: string;
  readonly message: string;
};

/**
 * Files a bug report, and tells a sensitive-data refusal apart from every other
 * failure.
 *
 * The split exists because these two are different events for the reporter. Any
 * other error is "something went wrong, try again" and belongs in a toast. A
 * `SENSITIVE_DATA_DETECTED` is a specific edit they have to make in a specific
 * box, and it is the only failure the browser could not have predicted — the MRN
 * rule needs this deployment's prefix and width, which are server configuration
 * the browser has no business learning just to run a courtesy check.
 */
export async function submitBugReport(
  input: CreateBugReportInput,
): Promise<
  | { readonly outcome: 'submitted'; readonly submission: BugReportSubmissionView }
  | { readonly outcome: 'sensitive-data'; readonly error: SensitiveDataFieldError }
> {
  try {
    const response = await bugReportControllerSubmitReportV1(input);
    const envelope = parseApiSuccess<BugReportSubmissionView>(response, '');
    return { outcome: 'submitted', submission: envelope.data };
  } catch (caughtError) {
    const sensitiveError = resolveSensitiveDataError(caughtError);
    if (sensitiveError === null) {
      throw caughtError;
    }
    return { outcome: 'sensitive-data', error: sensitiveError };
  }
}

type SensitiveDataResponseBody = {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
};

/**
 * Reads the coded refusal out of a 400 body, or `null` if this is some other
 * failure.
 *
 * Deliberately defensive about the shape: a proxy or a gateway can answer 400
 * with something else entirely, and mistaking that for a sensitive-data finding
 * would pin an error on a field the reporter cannot fix.
 */
function resolveSensitiveDataError(caughtError: unknown): SensitiveDataFieldError | null {
  const responseBody = (caughtError as AxiosError<SensitiveDataResponseBody>)?.response?.data;
  if (typeof responseBody !== 'object' || responseBody === null) {
    return null;
  }
  if (responseBody.code !== SENSITIVE_DATA_DETECTED) {
    return null;
  }
  const [firstError] = Array.isArray(responseBody.errors) ? responseBody.errors : [];
  const path = (firstError as { path?: unknown })?.path;
  const field = Array.isArray(path) ? String(path[0] ?? '') : '';
  return {
    field,
    category: String((firstError as { category?: unknown })?.category ?? ''),
    message: typeof responseBody.message === 'string' ? responseBody.message : '',
  };
}
