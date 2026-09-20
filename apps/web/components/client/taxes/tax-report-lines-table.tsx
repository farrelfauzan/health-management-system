'use client';

import type { Pp55ReportLine, PpnOutputReportLine, TaxReportView } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';

type TaxReportLinesTableProps = {
  report: TaxReportView;
};

/**
 * What a month's figures came from (P27-T05): the payments behind a PP 55
 * month, or the invoices behind a PPN month, one row per invoice and code.
 */
export function TaxReportLinesTable({ report }: TaxReportLinesTableProps) {
  const t = useTranslations('operations.taxes.reports.lines');
  const format = useFormatter();
  const formatDate = (value: string): string =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  if (report.lines.length === 0) {
    return <p className="text-sm text-slate-500">{t('empty')}</p>;
  }
  if (report.kind === 'PP55_OMZET') {
    const lines = report.lines as Pp55ReportLine[];
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('invoiceNumber')}</TableHead>
              <TableHead>{t('paidAt')}</TableHead>
              <TableHead>{t('method')}</TableHead>
              <TableHead className="text-right">{t('amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.paymentId}>
                <TableCell className="font-mono text-xs">{line.invoiceNumber}</TableCell>
                <TableCell>{formatDate(line.paidAt)}</TableCell>
                <TableCell>{line.method}</TableCell>
                <TableCell className="text-right">{formatRupiah(line.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  const lines = report.lines as PpnOutputReportLine[];
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('invoiceNumber')}</TableHead>
            <TableHead>{t('issuedAt')}</TableHead>
            <TableHead>{t('fakturCode')}</TableHead>
            <TableHead className="text-right">{t('taxableAmount')}</TableHead>
            <TableHead className="text-right">{t('taxBase')}</TableHead>
            <TableHead className="text-right">{t('taxAmount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={`${line.invoiceId}:${line.fakturTransactionCode}`}>
              <TableCell className="font-mono text-xs">{line.invoiceNumber}</TableCell>
              <TableCell>{formatDate(line.issuedAt)}</TableCell>
              <TableCell className="font-mono">
                {line.fakturTransactionCode === 'LEGACY' ||
                line.fakturTransactionCode === 'NOT_OBJECT'
                  ? t(`code.${line.fakturTransactionCode}`)
                  : line.fakturTransactionCode}
              </TableCell>
              <TableCell className="text-right">{formatRupiah(line.taxableAmount)}</TableCell>
              <TableCell className="text-right">{formatRupiah(line.taxBase)}</TableCell>
              <TableCell className="text-right">{formatRupiah(line.taxAmount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
