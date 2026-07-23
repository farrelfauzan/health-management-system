import { toast } from '@hms/ui';

import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';

export function notifyApiError(error: unknown, fallback: string): string {
  const message = resolveApiErrorMessage(error, fallback);
  toast.error(message);
  return message;
}
