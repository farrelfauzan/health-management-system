import type { DeliveryRefusalReasonValue } from '@hms/shared-types';

/** The `lastError` codes the worker writes that have their own sentence. */
export const KNOWN_DELIVERY_ERROR_CODES = [
  'CANCELLED_BY_STAFF',
  'INVOICE_NO_LONGER_DELIVERABLE',
  'DOCUMENT_NO_LONGER_DELIVERABLE',
  'FORMAT_NOT_DELIVERABLE',
  'DELIVERY_REFUSED_AT_SEND_TIME',
  'MAIL_REJECTED_BY_TRANSPORT',
  'ServiceUnavailableException',
  'UNSUPPORTED_DELIVERY_SUBJECT',
] as const;

export type KnownDeliveryErrorCode = (typeof KNOWN_DELIVERY_ERROR_CODES)[number];

export type ParsedDeliveryError = {
  code: KnownDeliveryErrorCode | null;
  raw: string;
  /** The gate's refusal behind a send-time cancellation, when there is one. */
  refusalReason: DeliveryRefusalReasonValue | null;
};

const REFUSED_AT_SEND_TIME = 'DELIVERY_REFUSED_AT_SEND_TIME';

/**
 * Splits the worker's `lastError` into something the timeline can translate:
 * a known code, and for a send-time refusal the gate reason after the colon.
 */
export function parseDeliveryError(lastError: string): ParsedDeliveryError {
  const [head, tail] = lastError.split(':', 2);
  if (head === REFUSED_AT_SEND_TIME) {
    return {
      code: REFUSED_AT_SEND_TIME,
      raw: lastError,
      refusalReason: (tail as DeliveryRefusalReasonValue | undefined) ?? null,
    };
  }
  const known = KNOWN_DELIVERY_ERROR_CODES.find((code) => code === lastError) ?? null;
  return { code: known, raw: lastError, refusalReason: null };
}
