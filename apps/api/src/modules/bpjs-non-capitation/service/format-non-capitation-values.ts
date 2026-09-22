const RUPIAH = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/**
 * How the recap's files print a figure and a date (P25-T16): rupiah with no
 * cents, and `YYYY-MM-DD` as `14/10/2026`, the way the induk's forms write it.
 */
export const NON_CAPITATION_FORMAT = {
  rupiah: (amount: number): string => RUPIAH.format(amount),
  date: (value: string): string =>
    `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`,
} as const;
