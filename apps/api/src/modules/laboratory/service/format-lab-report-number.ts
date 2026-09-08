const MAX_FRACTION_DIGITS = 4;

/**
 * A measured value or a band edge as the sheet prints it: Indonesian decimal
 * comma, trailing zeros dropped, never in exponent form. `Decimal(12,4)` is
 * how the row stores it; "11,2" is how a patient reads it.
 */
export function formatLabReportNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: MAX_FRACTION_DIGITS,
    useGrouping: false,
  }).format(value);
}
