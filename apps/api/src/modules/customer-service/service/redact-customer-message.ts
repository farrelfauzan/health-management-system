import { RedactCustomerMessageResult } from '@hms/shared-types';

/**
 * Digit runs that identify a person in Indonesia, longest first.
 *
 * **Order matters and is load-bearing.** NIK is 16 digits and BPJS is 13; a
 * 13-digit rule applied first would eat the first thirteen digits of a NIK
 * and leave three behind, which reads as redacted and is not. Matching
 * longest-first means each pattern only ever sees what the longer ones did
 * not claim.
 *
 * Separators are tolerated between digits because people type identifiers the
 * way they are printed — `3171.0203.4405.0001` is a NIK, and a rule that only
 * matched sixteen bare digits would pass it straight through to a provider.
 */
const SENSITIVE_DIGIT_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\b\d[\d\s.-]{14,22}\d\b/g, label: '[NIK DIREDAKSI]' },
  { pattern: /\b\d[\d\s.-]{11,16}\d\b/g, label: '[NOMOR BPJS DIREDAKSI]' },
];

/**
 * A bare run of 9 or more digits that survived the two rules above. Catches
 * the identifiers this codebase has not enumerated — an old KTP number, a
 * medical record number a customer copied off a card — on the principle that
 * a long digit run in a chat message to a clinic is far more likely to be an
 * identifier than anything the model needs.
 */
const LONG_DIGIT_RUN_PATTERN = /\b\d{9,}\b/g;

const LONG_DIGIT_RUN_LABEL = '[NOMOR DIREDAKSI]';

/**
 * Any run of two or more digits, separators tolerated. Only a candidate — what
 * it means is decided by {@link isIndonesianMobileNumber}.
 */
const DIGIT_RUN_PATTERN = /\+?\d[\d\s.-]*\d/g;

/**
 * A masked phone number, carrying its index and no digit run long enough for
 * any rule below to claim. `\u0000` cannot appear in a message typed on a
 * phone keyboard, so a customer cannot forge one to smuggle an identifier
 * through the masking.
 */
const PHONE_MASK_PREFIX = '\u0000TEL';
const PHONE_MASK_SUFFIX = '\u0000';

/**
 * An Indonesian mobile number in local form: `08` followed by 8–11 more
 * digits, i.e. the 10–13 digit range every operator issues.
 */
const INDONESIAN_MOBILE_LOCAL_PATTERN = /^08\d{8,11}$/;

/**
 * Strips volunteered identifiers out of a customer's message (§5.3).
 *
 * **This runs before persistence and before the provider**, which is the
 * whole point. `book_appointment` has no NIK or BPJS parameter, so the bot
 * structurally cannot *ask* — but a customer who volunteers one anyway would
 * otherwise put it in the transcript and in a third-party model's context,
 * and D-CS-03 is explicit that "the prompt says don't" is not a control.
 *
 * Redaction is substitution rather than rejection: the message still carries
 * its intent ("saya mau daftar, NIK saya [NIK DIREDAKSI]") so the customer is
 * answered rather than stonewalled, and the caller pairs it with the
 * arrival-completes-data template.
 *
 * **Phone numbers are exempted by shape, and that exemption is the reason this
 * function has a masking pass at all.** The booking flow asks the customer for
 * a phone number in so many words, so redacting the answer does not cost "a
 * clarifying question" as an earlier version of this comment claimed — it ends
 * the booking. The number is destroyed before persistence, the redaction also
 * diverts the whole turn away from the model, and the customer's *name*, typed
 * in the same message, is lost with it. Every Indonesian mobile number typed
 * without separators is 10–13 bare digits and was being taken by the
 * nine-digit catch-all, so the flow could not complete for the most natural
 * way to answer the question.
 *
 * Masking runs first so the exempted runs are invisible to the three rules
 * below rather than racing them, and the mask is restored afterwards.
 *
 * **The residual risk is stated rather than solved**: a 13-digit BPJS number
 * that happens to begin `08` is indistinguishable from a phone number by shape
 * and will now pass through. BPJS Kesehatan numbers begin `0000`, `0001` or
 * `1`, so this is a narrow window — and it is the deliberate price of a
 * booking flow that works when a customer answers the question they were
 * asked. NIK, which is 16 digits, cannot fit the exemption at all.
 */
export function redactCustomerMessage(content: string): RedactCustomerMessageResult {
  const { masked, phoneNumbers } = maskIndonesianMobileNumbers(content);
  let redacted = masked;
  for (const { pattern, label } of SENSITIVE_DIGIT_PATTERNS) {
    redacted = redacted.replace(pattern, (match) =>
      countDigits(match) >= minimumDigitsFor(label) ? label : match,
    );
  }
  redacted = redacted.replace(LONG_DIGIT_RUN_PATTERN, LONG_DIGIT_RUN_LABEL);
  const restored = restorePhoneNumbers(redacted, phoneNumbers);
  return { content: restored, wasRedacted: restored !== content };
}

/**
 * Replaces every run that looks like an Indonesian mobile number with a mask,
 * returning the masked text and the originals in the order they were found.
 */
function maskIndonesianMobileNumbers(content: string): {
  masked: string;
  phoneNumbers: readonly string[];
} {
  const phoneNumbers: string[] = [];
  const masked = content.replace(DIGIT_RUN_PATTERN, (match) => {
    if (!isIndonesianMobileNumber(match)) {
      return match;
    }
    phoneNumbers.push(match);
    return `${PHONE_MASK_PREFIX}${phoneNumbers.length - 1}${PHONE_MASK_SUFFIX}`;
  });
  return { masked, phoneNumbers };
}

/**
 * Both forms a customer types resolve to the same local shape: `+62`/`62`
 * becomes a leading `0` before the length rule is applied, so
 * `+6281298765432` and `081298765432` are the one number they obviously are.
 */
function isIndonesianMobileNumber(value: string): boolean {
  const digits = extractDigits(value);
  const local = digits.startsWith('62') ? `0${digits.slice(2)}` : digits;
  return INDONESIAN_MOBILE_LOCAL_PATTERN.test(local);
}

function restorePhoneNumbers(content: string, phoneNumbers: readonly string[]): string {
  return phoneNumbers.reduce(
    (text, phoneNumber, index) =>
      text.replace(`${PHONE_MASK_PREFIX}${index}${PHONE_MASK_SUFFIX}`, phoneNumber),
    content,
  );
}

/**
 * The separator-tolerant patterns match on total length, so a run padded with
 * spaces and dots could satisfy one while carrying too few actual digits.
 * Counting them is what keeps `12.34.56.78.90.12.34` from being labelled a
 * NIK when it holds fourteen digits.
 */
function countDigits(value: string): number {
  return extractDigits(value).length;
}

function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function minimumDigitsFor(label: string): number {
  return label === '[NIK DIREDAKSI]' ? 16 : 13;
}
