import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

/**
 * The `error.code` of an API envelope, when the thrower named one — the
 * machine-readable half of `{ error: { code, message } }`. Lets a form turn a
 * known refusal (`DOCTOR_AUTHORITY_ALREADY_ACTIVE`) into translated copy
 * rather than showing the API's English message.
 */
export function resolveApiErrorCode(error: unknown): string | undefined {
  if (!isAxiosError(error)) {
    return undefined;
  }
  const payload = error.response?.data as Partial<ApiError> | undefined;
  const code = payload?.error?.code;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}
