import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

const HTTP_TOO_MANY_REQUESTS = 429;
const SECONDS_PER_MINUTE = 60;

export type LoginErrorMessages = {
  invalidCredentials: string;
  loginFailed: string;
  /** The throttle's refusal; `retryAfterMinutes` is null when the API named no wait. */
  throttled: (retryAfterMinutes: number | null) => string;
};

export function resolveLoginErrorMessage(error: unknown, messages: LoginErrorMessages): string {
  if (!isAxiosError(error)) {
    return messages.loginFailed;
  }

  if (error.response?.status === 401) {
    return messages.invalidCredentials;
  }

  if (error.response?.status === HTTP_TOO_MANY_REQUESTS) {
    return messages.throttled(resolveRetryAfterMinutes(error.response.data));
  }

  return messages.loginFailed;
}

/**
 * Whole minutes to wait, rounded up so "try again in 1 minute" is never a
 * promise the throttle breaks. The API sends seconds in `details`.
 */
function resolveRetryAfterMinutes(payload: unknown): number | null {
  const details = (payload as Partial<ApiError> | undefined)?.error?.details;
  const seconds = (details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return Math.ceil(seconds / SECONDS_PER_MINUTE);
}
