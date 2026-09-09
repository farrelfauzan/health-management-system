/**
 * The country calling code every phone number this product stores belongs to,
 * without the `+`. Indonesia is the only country HMS serves, so the prefix is
 * fixed rather than chosen: `PhoneInput` renders it as furniture and this
 * module writes it into the stored value. A country selector is the change
 * that makes it a variable (`SJ-166`, out of scope).
 */
export const INDONESIAN_PHONE_COUNTRY_CODE = '62';

/**
 * What a *stored* Indonesian phone number looks like: the country code, a
 * non-zero leading digit, then seven to twelve more digits.
 *
 * The leading `[1-9]` is what rejects `620…`, which is the shape a
 * double-prefixed number takes when somebody types `+62` in front of a number
 * that already began with `0`. The 8-to-13 digit national part covers mobile
 * numbers (`812…`, ten to twelve digits) and landlines (`21…`, eight or nine),
 * which is every number a clinic actually files.
 *
 * Only ever tested against the output of {@link normalizePhoneNumber} — never
 * against raw input, which legitimately arrives as `0812…` or `+62 812-…`.
 */
export const INDONESIAN_PHONE_NUMBER_PATTERN = /^62[1-9]\d{7,12}$/;

/**
 * Reduces an Indonesian phone number to one canonical form for storage and
 * comparison (strategy §5.1).
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
 * '', 'g'), '^0', '62')` inside the lookup query, because rows written before
 * `SJ-166` hold whatever the front desk typed and the backfill deliberately
 * leaves the ones it cannot canonicalise alone. The two must stay identical;
 * the patient repository's lookup method names this file as its pair.
 */
export function normalizePhoneNumber(rawPhoneNumber: string): string {
  const digits = rawPhoneNumber.replace(/\D/g, '');
  return digits.startsWith('0') ? `${INDONESIAN_PHONE_COUNTRY_CODE}${digits.slice(1)}` : digits;
}
