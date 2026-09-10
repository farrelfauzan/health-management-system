const MAX_DIGITS_PER_PART = 3;

/**
 * Keeps an RT/RW field in the `003/007` shape the KTP prints while it is being
 * typed.
 *
 * Digits only, at most three either side of a single slash, and the slash is
 * inserted after the third digit so somebody typing `003007` gets `003/007`
 * without reaching for the key. Typing the slash themselves works too, which is
 * why a trailing one survives: `003/` has to be a legal intermediate state or
 * the field fights the second half out of existence.
 *
 * A light touch on purpose — a two-digit RT is written `03` on some cards and
 * `3` on others, and `rtRwSchema` accepts one to three digits either side, so
 * this must not pad or reformat what the clerk copied off the card.
 */
export function formatRtRwInput(value: string): string {
  const digitsOnly = value.replace(/\D/g, '').slice(0, MAX_DIGITS_PER_PART * 2);
  const hasSeparator = value.includes('/');
  if (digitsOnly.length <= MAX_DIGITS_PER_PART && !hasSeparator) {
    return digitsOnly;
  }
  const separatorIndex = hasSeparator
    ? Math.min(value.indexOf('/'), digitsOnly.length, MAX_DIGITS_PER_PART)
    : MAX_DIGITS_PER_PART;
  const rt = digitsOnly.slice(0, separatorIndex);
  const rw = digitsOnly.slice(separatorIndex, separatorIndex + MAX_DIGITS_PER_PART);
  return `${rt}/${rw}`;
}
