/**
 * The words that revoke WhatsApp delivery consent (`P16-T24`, FR-E4-16).
 *
 * Matched as the *whole* message, case-insensitively, after trimming and with
 * trailing punctuation forgiven — `BERHENTI`, `stop`, ` Berhenti! ` all
 * count. Deliberately not a substring match: "tolong jangan berhenti kirim"
 * says the opposite, and a keyword that fired inside a sentence would revoke
 * consent for someone who was asking to keep it.
 */
export const DELIVERY_OPT_OUT_KEYWORDS = ['STOP', 'BERHENTI'] as const;

const OPT_OUT_PATTERN = new RegExp(`^\\s*(?:${DELIVERY_OPT_OUT_KEYWORDS.join('|')})[\\s.!]*$`, 'i');

export function isDeliveryOptOutKeyword(text: string): boolean {
  return OPT_OUT_PATTERN.test(text);
}
