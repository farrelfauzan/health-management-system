/**
 * Reduces an Indonesian phone number to one canonical form for comparison
 * (strategy §5.1).
 *
 * A match against the registry is an exact comparison, and the same number
 * reaches this code written at least four ways: `081210000001`,
 * `+62 812-1000-0001`, `62812 1000001`, `(0812) 1000-0001`. Comparing the raw
 * strings would miss almost every real returning patient — and a missed match
 * is not a harmless false negative here: it silently creates a second patient
 * record for someone the clinic already knows, which is a split medical
 * history that PMK 24/2022 retention then makes permanent.
 *
 * The rule is: keep the digits, then treat a leading `0` as the Indonesian
 * national prefix and replace it with `62`. Nothing else is inferred — a
 * number that is already international keeps its country code, and a number
 * that is neither is returned as its digits, which will simply fail to match
 * rather than be coerced into a country it may not belong to.
 *
 * **This function is duplicated, on purpose, in SQL.** The registry side of
 * the comparison runs as `regexp_replace(regexp_replace(phone_number, '\D',
 * '', 'g'), '^0', '62')` inside the lookup query, because the column holds
 * whatever the front desk typed and there is no way to normalise it in TypeScript
 * without loading the table. The two must stay identical; the repository
 * method's own comment names this file as its pair.
 */
export function normalizePhoneNumber(rawPhoneNumber: string): string {
  const digits = rawPhoneNumber.replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}
