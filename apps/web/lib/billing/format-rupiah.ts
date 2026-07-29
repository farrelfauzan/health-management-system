const RUPIAH_FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Money as an Indonesian clinic reads it: `Rp 150.000`. Fractional rupiah are
 * shown only when the amount actually carries them — tariffs are whole rupiah
 * in practice, and a trailing `,00` on every line is noise on an invoice.
 */
export function formatRupiah(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '-';
  }

  return RUPIAH_FORMATTER.format(amount);
}
