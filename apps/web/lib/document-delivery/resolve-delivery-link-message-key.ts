import { isAxiosError } from 'axios';

/**
 * The `authShell.deliveryLink` keys this resolver may return — a literal
 * union so next-intl's typed catalog still checks the lookup.
 */
export type DeliveryLinkMessageKey = 'invalidLink' | 'tooManyAttempts';

const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;

/**
 * The public link page is the one place a patient meets this software with
 * no session and Indonesian copy around them, so the two ways the API can
 * refuse are translated by status: every dead link is the same 404 on
 * purpose (§7.4.9), and a 429 is the rate limit, not the link.
 */
export function resolveDeliveryLinkMessageKey(error: unknown): DeliveryLinkMessageKey | null {
  if (!isAxiosError(error)) {
    return null;
  }
  switch (error.response?.status) {
    case HTTP_NOT_FOUND:
      return 'invalidLink';
    case HTTP_TOO_MANY_REQUESTS:
      return 'tooManyAttempts';
    default:
      return null;
  }
}
