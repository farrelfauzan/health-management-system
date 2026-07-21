import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

export function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const payload = error.response?.data as Partial<ApiError> | undefined;
  return payload?.error?.message ?? fallback;
}
