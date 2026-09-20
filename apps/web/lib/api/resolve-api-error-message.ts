import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

import { resolveApiErrorIssues } from '#lib/api/resolve-api-error-issues';

type NestErrorPayload = {
  message?: string | string[];
};

function resolveResponseMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  // A validation refusal's own message is the generic "Validation failed";
  // what the reader needs is the rule each field broke.
  const issueMessages = [...new Set(resolveApiErrorIssues(payload).map((issue) => issue.message))];
  if (issueMessages.length > 0) {
    return issueMessages.join('; ');
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
