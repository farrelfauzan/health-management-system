import { isAxiosError } from 'axios';
import type { ApiError, RegistrationOutsideSessionDetails } from '@hms/shared-types';

const OUTSIDE_SESSION_CODE = 'REGISTRATION_OUTSIDE_SESSION';
const KNOWN_REASONS = ['NO_SESSION', 'BEFORE_OPENING', 'AFTER_END'] as const;

function isOutsideSessionDetails(value: unknown): value is RegistrationOutsideSessionDetails {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RegistrationOutsideSessionDetails>;
  return (
    typeof candidate.doctorName === 'string' &&
    KNOWN_REASONS.some((reason) => reason === candidate.reason)
  );
}

/**
 * The structured half of a refused check-in (P19-T16), or null for every other
 * failure.
 *
 * The API's own sentence is English; these fields are what lets the dialog say
 * the same thing in the reader's locale. A response that carries the code but
 * not the shape falls back to null, so an older API answering a newer web app
 * shows its plain message rather than a half-rendered template.
 */
export function resolveOutsideSessionDetails(
  error: unknown,
): RegistrationOutsideSessionDetails | null {
  if (!isAxiosError(error)) {
    return null;
  }
  const payload = error.response?.data as Partial<ApiError> | undefined;
  if (payload?.error?.code !== OUTSIDE_SESSION_CODE) {
    return null;
  }
  return isOutsideSessionDetails(payload.error.details) ? payload.error.details : null;
}
