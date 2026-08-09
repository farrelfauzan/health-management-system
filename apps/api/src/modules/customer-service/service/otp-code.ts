import { randomInt } from 'node:crypto';

/** Six digits, as §5.1.1 specifies — long enough to resist three guesses, short enough to retype. */
const OTP_CODE_LENGTH = 6;

/**
 * Mints one verification code.
 *
 * `randomInt` rather than `Math.random`: for the next five minutes this code
 * is a working credential against someone else's patient record, and a
 * predictable one would make the whole challenge theatre. `randomInt` draws
 * from the same CSPRNG as key generation and is free of the modulo bias a
 * hand-rolled `floor(random() * range)` introduces.
 *
 * Zero-padded rather than range-shifted, so `000123` is as likely as `912345`
 * — shifting the range to avoid leading zeros would quietly remove a tenth of
 * the keyspace.
 */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_CODE_LENGTH)).padStart(OTP_CODE_LENGTH, '0');
}

/**
 * Whether an inbound message is a plausible code submission at all.
 *
 * Used to tell "the customer typed the code" from "the customer typed a
 * question while a challenge was outstanding", and the two get very different
 * treatment: only the first spends one of the three attempts. Digits are
 * extracted with spacing and punctuation removed, because people type
 * `123 456`.
 */
export function extractOtpCodeCandidate(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  return digits.length === OTP_CODE_LENGTH ? digits : null;
}
