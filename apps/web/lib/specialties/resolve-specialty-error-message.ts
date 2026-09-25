import { isAxiosError } from 'axios';
import {
  SPECIALTY_IN_USE_ERROR_CODE,
  SPECIALTY_NAME_TAKEN_ERROR_CODE,
  type ApiError,
  type SpecialtyInUseDetails,
} from '@hms/shared-types';

import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';

export type SpecialtyErrorMessages = {
  nameTaken: string;
  inUse: (details: SpecialtyInUseDetails) => string;
  fallback: string;
};

/**
 * The two refusals the poli screen can explain in the reader's language — a
 * name already taken, and a poli still in use (with what is using it). Anything
 * else falls back to the API's own message or the generic copy.
 */
export function resolveSpecialtyErrorMessage(
  error: unknown,
  messages: SpecialtyErrorMessages,
): string {
  const envelope = isAxiosError(error)
    ? (error.response?.data as Partial<ApiError> | undefined)?.error
    : undefined;
  if (envelope?.code === SPECIALTY_NAME_TAKEN_ERROR_CODE) {
    return messages.nameTaken;
  }
  if (envelope?.code === SPECIALTY_IN_USE_ERROR_CODE) {
    return messages.inUse(toInUseDetails(envelope.details));
  }
  return resolveApiErrorMessage(error, messages.fallback);
}

function toInUseDetails(details: unknown): SpecialtyInUseDetails {
  const counts = (details ?? {}) as Partial<Record<keyof SpecialtyInUseDetails, unknown>>;
  return {
    activeClinicianCount:
      typeof counts.activeClinicianCount === 'number' ? counts.activeClinicianCount : 0,
    activeTariffCount: typeof counts.activeTariffCount === 'number' ? counts.activeTariffCount : 0,
  };
}
