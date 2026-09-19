'use client';

import type { TaxPriceBreakdownView } from '@hms/shared-types';
import { TableCell } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';

type TaxPriceBreakdownCellsProps = {
  breakdown?: TaxPriceBreakdownView;
  className?: string;
};

/**
 * The two admin-only columns beside a price (P27-T04): the price before PPN
 * and the PPN inside it. A row with nothing to split says why instead — the
 * patient never sees any of this, only the price and "Harga sudah termasuk PPN".
 */
export function TaxPriceBreakdownCells({ breakdown, className }: TaxPriceBreakdownCellsProps) {
  const t = useTranslations('shared.taxBreakdown');

  if (!breakdown || breakdown.status === 'UNPRICED') {
    return (
      <>
        <TableCell className={className}>—</TableCell>
        <TableCell className={className}>—</TableCell>
      </>
    );
  }
  if (breakdown.status !== 'TAXED') {
    return (
      <>
        <TableCell className={className}>
          {breakdown.priceBeforeTax === undefined ? '—' : formatRupiah(breakdown.priceBeforeTax)}
        </TableCell>
        <TableCell className={className}>
          <span className="text-xs text-slate-500">{t(`status.${breakdown.status}`)}</span>
        </TableCell>
      </>
    );
  }
  return (
    <>
      <TableCell className={className}>{formatRupiah(breakdown.priceBeforeTax ?? 0)}</TableCell>
      <TableCell className={className}>{formatRupiah(breakdown.taxAmount ?? 0)}</TableCell>
    </>
  );
}
