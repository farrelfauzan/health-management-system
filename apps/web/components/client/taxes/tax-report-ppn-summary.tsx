'use client';

import type { PpnOutputReportSummary } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { formatRupiah } from '#lib/billing/format-rupiah';

type TaxReportPpnSummaryProps = {
  summary: PpnOutputReportSummary;
};

/**
 * The month's output VAT by faktur code (P27-T05): 04 for taxed goods and
 * services, 08 for exempt medical services — both reported, only 04 carries
 * PPN. Lines billed before the tax module are counted apart, never guessed.
 */
export function TaxReportPpnSummary({ summary }: TaxReportPpnSummaryProps) {
  const t = useTranslations('operations.taxes.reports.ppn');

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('fakturCode')}</TableHead>
              <TableHead className="text-right">{t('invoiceCount')}</TableHead>
              <TableHead className="text-right">{t('taxableAmount')}</TableHead>
              <TableHead className="text-right">{t('taxBase')}</TableHead>
              <TableHead className="text-right">{t('taxAmount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.groups.map((group) => (
              <TableRow key={group.fakturTransactionCode}>
                <TableCell className="font-mono">{group.fakturTransactionCode}</TableCell>
                <TableCell className="text-right">{group.invoiceCount}</TableCell>
                <TableCell className="text-right">{formatRupiah(group.taxableAmount)}</TableCell>
                <TableCell className="text-right">{formatRupiah(group.taxBase)}</TableCell>
                <TableCell className="text-right">{formatRupiah(group.taxAmount)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell>{t('total')}</TableCell>
              <TableCell className="text-right">{summary.invoiceCount}</TableCell>
              <TableCell className="text-right">
                {formatRupiah(summary.totals.taxableAmount)}
              </TableCell>
              <TableCell className="text-right">{formatRupiah(summary.totals.taxBase)}</TableCell>
              <TableCell className="text-right">{formatRupiah(summary.totals.taxAmount)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-slate-600">
        {t('dueDate', { date: summary.paymentDueDate })} · {t('digunggung')}
      </p>
      {summary.legacyLineCount > 0 ? (
        <InlineNotice tone="warning">
          {t('legacy', {
            count: summary.legacyLineCount,
            amount: formatRupiah(summary.legacyAmount),
          })}
        </InlineNotice>
      ) : null}
    </div>
  );
}
