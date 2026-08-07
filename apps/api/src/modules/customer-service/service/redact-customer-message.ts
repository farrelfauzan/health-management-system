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
 * **Phone numbers are deliberately not redacted.** The booking flow collects
 * one by design (§5.3), it is the customer's own and the one they are
 * messaging from, and redacting it would break the feature this channel
 * exists for. Indonesian mobile numbers are 10–13 digits, which is why the
 * catch-all threshold sits at 9 with the two specific rules taking precedence
 * — a real limitation, noted honestly: a 13-digit phone number typed without
 * separators is indistinguishable from a BPJS number by shape alone, and this
 * function resolves that ambiguity toward redaction. Losing a phone number to
 * over-redaction costs a clarifying question; leaking a payer identifier to a
 * processor does not undo.
 */
export function redactCustomerMessage(content: string): RedactCustomerMessageResult {
  let redacted = content;
  for (const { pattern, label } of SENSITIVE_DIGIT_PATTERNS) {
    redacted = redacted.replace(pattern, (match) =>
      countDigits(match) >= minimumDigitsFor(label) ? label : match,
    );
  }
  redacted = redacted.replace(LONG_DIGIT_RUN_PATTERN, LONG_DIGIT_RUN_LABEL);
  return { content: redacted, wasRedacted: redacted !== content };
}

/**
 * The separator-tolerant patterns match on total length, so a run padded with
 * spaces and dots could satisfy one while carrying too few actual digits.
 * Counting them is what keeps `12.34.56.78.90.12.34` from being labelled a
 * NIK when it holds fourteen digits.
 */
function countDigits(value: string): number {
  return value.replace(/\D/g, '').length;
}

function minimumDigitsFor(label: string): number {
  return label === '[NIK DIREDAKSI]' ? 16 : 13;
}
