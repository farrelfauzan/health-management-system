import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const LOGIN_FAILED_MESSAGE = 'Unable to sign in right now. Please try again.';

export function resolveLoginErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return LOGIN_FAILED_MESSAGE;
  }

  if (error.response?.status === 401) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  const payload = error.response?.data as Partial<ApiError> | undefined;
  return payload?.error?.message ?? LOGIN_FAILED_MESSAGE;
}
