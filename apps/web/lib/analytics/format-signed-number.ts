const MINUS_SIGN = '−';

/**
 * A change with its sign always written: "+8,4", "−1,2", "0". Uses the true
 * minus sign, which screen readers say as "minus" and which lines up with
 * the plus in tabular figures; the hyphen does neither.
 */
export function formatSignedNumber(value: number, locale: string): string {
  const magnitude = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Math.abs(value),
  );
  if (value > 0) {
    return `+${magnitude}`;
  }
  return value < 0 ? `${MINUS_SIGN}${magnitude}` : magnitude;
}
