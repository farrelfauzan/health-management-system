import type { FormatRupiahOptions } from '#lib/analytics/analytics-filter-state';

const COMPACT_FROM = 1_000_000;
const MINUS_SIGN = '−';
const NON_BREAKING_SPACE = ' ';

/**
 * Rupiah the way the clinic reads it: "Rp186,4 jt" on a tile, "Rp162.500"
 * for anything under a million, and "Rp61.200.000" in full where a table
 * needs the exact figure. Every space becomes a non-breaking one, so the
 * server and the browser render the same text whichever ICU they carry.
 */
export function formatRupiah(
  value: number,
  locale: string,
  { isCompact = false, isSigned = false }: FormatRupiahOptions = {},
): string {
  const magnitude = Math.abs(value);
  const formatter =
    isCompact && magnitude >= COMPACT_FROM
      ? new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const amount = `Rp${formatter.format(magnitude).replace(/\s/g, NON_BREAKING_SPACE)}`;
  if (value < 0) {
    return `${MINUS_SIGN}${amount}`;
  }
  return isSigned && value > 0 ? `+${amount}` : amount;
}
