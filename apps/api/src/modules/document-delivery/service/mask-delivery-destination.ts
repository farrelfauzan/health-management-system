import { DeliveryDestination } from '@hms/shared-types';

const PHONE_VISIBLE_PREFIX = 4;
const PHONE_VISIBLE_SUFFIX = 4;
const PHONE_MIN_LENGTH_FOR_BOTH_ENDS = PHONE_VISIBLE_PREFIX + PHONE_VISIBLE_SUFFIX + 2;
const SHORT_PHONE_VISIBLE_PREFIX = 2;
const MASK = '****';
const EMAIL_MASK = '***';

/**
 * What the timeline shows instead of a contact detail (FR-E4-12):
 * `6281****0024`, `r***@example.test`. Enough for a cashier to confirm "yes,
 * that number", not enough for a delivery log to become a contact list.
 */
export function maskDeliveryDestination(destination: DeliveryDestination): string {
  if (destination.channel === 'EMAIL') {
    return maskEmailAddress(destination.email);
  }
  return maskPhoneNumber(destination.phoneNumber);
}

export function maskPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replaceAll(/\D/g, '');
  if (digits.length >= PHONE_MIN_LENGTH_FOR_BOTH_ENDS) {
    return `${digits.slice(0, PHONE_VISIBLE_PREFIX)}${MASK}${digits.slice(-PHONE_VISIBLE_SUFFIX)}`;
  }
  return `${digits.slice(0, SHORT_PHONE_VISIBLE_PREFIX)}${MASK}`;
}

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0) {
    return `${trimmed.slice(0, 1)}${EMAIL_MASK}`;
  }
  return `${trimmed.slice(0, 1)}${EMAIL_MASK}${trimmed.slice(atIndex)}`;
}
