import { isAxiosError } from 'axios';
import {
  MIDWIFE_AUTHORITY_REQUIRED_ERROR_CODE,
  doctorAuthorityKindSchema,
  type ApiError,
  type DoctorAuthorityKindValue,
} from '@hms/shared-types';

import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';

/**
 * The authority a midwife was refused for (P25-T03), when the error is the
 * API's `MIDWIFE_AUTHORITY_REQUIRED` 422 — `details.kind` names it. Anything
 * else, including a malformed kind, is `undefined`, so the caller falls back
 * to its ordinary error copy.
 */
export function resolveMidwifeAuthorityRefusalKind(
  error: unknown,
): DoctorAuthorityKindValue | undefined {
  if (resolveApiErrorCode(error) !== MIDWIFE_AUTHORITY_REQUIRED_ERROR_CODE || !isAxiosError(error)) {
    return undefined;
  }
  const payload = error.response?.data as Partial<ApiError> | undefined;
  const details = payload?.error?.details as { kind?: unknown } | undefined;
  const parsed = doctorAuthorityKindSchema.safeParse(details?.kind);
  return parsed.success ? parsed.data : undefined;
}
