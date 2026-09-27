'use client';

import type { TaxReportKindValue, TaxReportListItem } from '@hms/shared-types';
import { Button, TableCell, TableRow, cn } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

import { TaxReportStatusBadge } from '#components/client/taxes/tax-report-status-badge';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatTaxReportPeriod } from '#lib/taxes/format-tax-report-period';
import { useCreateTaxReport } from '#lib/taxes/use-create-tax-report';

type TaxReportMonthsTableRowProps = {
  period: string;
  kind: TaxReportKindValue;
  report?: TaxReportListItem;
  canWrite: boolean;
  isFuture: boolean;
};

/**
 * One month of one report as a table row: the same states as the month card —
 * not yet drafted, a draft, final, or final but out of date with the books.
 */
export function TaxReportMonthsTableRow({
  period,
  kind,
  report,
  canWrite,
  isFuture,
}: TaxReportMonthsTableRowProps) {
  const t = useTranslations('operations.taxes.reports');
  const locale = useLocale();
  const { createReport, isPending } = useCreateTaxReport({ period, kind });
  const label = formatTaxReportPeriod(period, locale);

  return (
    <TableRow className={cn(isFuture && 'opacity-50')}>
      <TableCell className="font-medium text-slate-900">{label}</TableCell>
      <TableCell className="text-right tabular-nums">
        {report ? formatRupiah(report.taxDue) : '—'}
      </TableCell>
      <TableCell>
        {report ? (
          <TaxReportStatusBadge report={report} />
        ) : (
          <span className="text-xs text-slate-400">{t('status.NONE')}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {report ? (
          <Button asChild type="button" size="sm" variant="outline">
            <Link href={`/admin/taxes/reports/${report.id}`}>{t('open')}</Link>
          </Button>
        ) : null}
        {!report && canWrite && !isFuture ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void createReport()}
          >
            {t('create')}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
