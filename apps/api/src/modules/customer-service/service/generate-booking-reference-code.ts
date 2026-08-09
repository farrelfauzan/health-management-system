import { randomInt } from 'node:crypto';

/**
 * Crockford base32 minus `I`, `L`, `O` and `U`: the four that get misread as
 * `1`, `1`, `0` and misheard as each other when a customer reads a code back
 * to the front desk over the phone.
 */
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const REFERENCE_BODY_LENGTH = 6;

/** Marks a code as this channel's at a glance in the appointment list. */
const REFERENCE_PREFIX = 'CS';

/**
 * Mints the code the confirmation reply quotes (§4.2 output allowlist).
 *
 * It exists because the customer needs something to say at the counter and
 * the admin needs something to search, and neither can be the appointment's
 * UUID — nobody reads one of those over a phone. Six characters from a
 * 32-symbol alphabet is a billion codes, which is not a security boundary and
 * is not meant to be: knowing a reference code grants nothing, because there
 * is no tool that looks one up. It is a handle, and the database's unique
 * index is what makes it a *unique* handle.
 *
 * Random rather than sequential on purpose. A sequential code would tell every
 * customer how many bookings the clinic took this week, which is not theirs to
 * know, and would make the next code guessable if that ever started to matter.
 */
export function generateBookingReferenceCode(): string {
  let body = '';
  for (let index = 0; index < REFERENCE_BODY_LENGTH; index += 1) {
    body += REFERENCE_ALPHABET[randomInt(0, REFERENCE_ALPHABET.length)];
  }
  return `${REFERENCE_PREFIX}-${body}`;
}
