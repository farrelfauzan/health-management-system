/**
 * The national part of whatever the user typed or pasted, for a phone field
 * whose country code is furniture rather than input (`SJ-166`).
 *
 * Testers type a number four ways — `08123456789`, `+62 812-3456-789`,
 * `62812…`, or just `812…` — and all four have to land in a box that already
 * shows `+62`. So: keep the digits, then remove whichever prefix is in front
 * of the national number. A leading `0` is the Indonesian trunk prefix; a
 * leading country code is the same number written internationally. Removing
 * both, in that order, is what makes a paste of any of the four forms show the
 * same `812…`.
 *
 * `0` is stripped after the country code so that `+620812…` — the shape a
 * paste takes when someone prefixes a number that already had its trunk zero —
 * reduces to `812…` rather than to `0812…`, which would then read as a
 * different number entirely.
 *
 * Letters never survive: they are not digits, so a pasted `tidak punya`
 * becomes an empty field rather than a value the form would try to submit.
 */
export function toNationalPhoneDigits(rawValue: string, countryCode: string): string {
  let digits = rawValue.replace(/\D/g, '');
  if (digits.startsWith(countryCode)) {
    digits = digits.slice(countryCode.length);
  }
  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}
