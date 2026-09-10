import { notifyStatement } from '#lib/api/notify-statement';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';

export function notifyApiError(error: unknown, fallback: string): string {
  const message = resolveApiErrorMessage(error, fallback);
  notifyStatement({ tone: 'error', title: message });
  return message;
}
