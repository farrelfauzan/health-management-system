import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

type NestErrorPayload = {
  message?: string | string[];
};

function resolveResponseMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const envelopeMessage = (payload as Partial<ApiError>).error?.message;
  if (typeof envelopeMessage === 'string' && envelopeMessage) {
    return envelopeMessage;
  }
  const nestMessage = (payload as NestErrorPayload).message;
  if (typeof nestMessage === 'string' && nestMessage) {
    return nestMessage;
  }
  if (Array.isArray(nestMessage) && nestMessage.length > 0) {
    return nestMessage.join(', ');
  }
  return undefined;
}

export function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  return resolveResponseMessage(error.response?.data) ?? fallback;
}
