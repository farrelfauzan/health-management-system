import { isAxiosError } from 'axios';
import type { DeliveryChannelValue, DeliveryRefusalReasonValue } from '@hms/shared-types';

const HTTP_UNPROCESSABLE = 422;
const REFUSED_CODE = 'DELIVERY_CHANNEL_REFUSED';

export type DeliveryRefusal = {
  channel: DeliveryChannelValue;
  refusalReason: DeliveryRefusalReasonValue;
};

type RefusalPayload = {
  error?: { code?: string; details?: { channel?: string; refusalReason?: string } };
};

/**
 * Picks the channel refusal out of a 422 on the send request (FR-E4-03/04),
 * so the dialog can show the same sentence the patient record shows for
 * that channel rather than the API's English line. Anything else — a draft
 * invoice, a missing date of birth — returns null and the API message is
 * used as-is, because those messages are specific and actionable.
 */
export function resolveDeliveryRefusal(error: unknown): DeliveryRefusal | null {
  if (!isAxiosError(error) || error.response?.status !== HTTP_UNPROCESSABLE) {
    return null;
  }
  const payload = error.response.data as RefusalPayload | undefined;
  const details = payload?.error?.details;
  if (payload?.error?.code !== REFUSED_CODE || !details?.channel || !details.refusalReason) {
    return null;
  }
  return {
    channel: details.channel as DeliveryChannelValue,
    refusalReason: details.refusalReason as DeliveryRefusalReasonValue,
  };
}
