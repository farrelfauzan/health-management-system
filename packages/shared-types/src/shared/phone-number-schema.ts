import { z } from 'zod';

import { INDONESIAN_PHONE_NUMBER_PATTERN, normalizePhoneNumber } from '#shared/phone-number';

/**
 * The shortest and longest raw string worth trying to canonicalise. Both are
 * checked before normalisation, so they bound what the user typed rather than
 * what is stored — `+62 (0812) 3456-7890` is twenty-one characters of eleven
 * digits, and a paste that overruns 32 is not a phone number at all.
 */
const RAW_PHONE_NUMBER_MIN_LENGTH = 6;
const RAW_PHONE_NUMBER_MAX_LENGTH = 32;

export const INDONESIAN_PHONE_NUMBER_MESSAGE =
  'Must be an Indonesian phone number, for example 0812 3456 7890';

/**
 * One phone field, accepted in every shape a human writes it and stored in
 * exactly one (`SJ-166`).
 *
 * The order matters. Normalisation happens first, in a `.transform`, so
 * `0812…`, `+62 812-…`, `62812…` and the parenthesised form all reach the
 * database as `62812…` — the shape `ChannelPatientLink` and
 * `ProspectivePatient` already hold, which is what lets a chat booking find a
 * patient the front desk typed in. The pattern is checked *after* that, so it
 * is describing the stored value and not the keystrokes: letters, a number
 * with no digits and a double-prefixed `620…` all fail here, which the
 * length-only rule this replaces let through.
 *
 * Because the check is a `.refine` on the transformed value rather than a
 * `.regex` on the input, the OpenAPI schema advertises a bounded string and
 * not the strict pattern. That is deliberate: the pattern is not what a client
 * may send, and publishing it would tell every generated client to reject the
 * `08…` this endpoint exists to accept.
 */
export const indonesianPhoneNumberSchema = z
  .string()
  .trim()
  .min(RAW_PHONE_NUMBER_MIN_LENGTH)
  .max(RAW_PHONE_NUMBER_MAX_LENGTH)
  .transform(normalizePhoneNumber)
  .refine(
    (phoneNumber) => INDONESIAN_PHONE_NUMBER_PATTERN.test(phoneNumber),
    INDONESIAN_PHONE_NUMBER_MESSAGE,
  )
  .describe(
    'Indonesian phone number. Accepts 0812…, +62 812-…, 62812… and punctuated forms; stored as 62812….',
  );
