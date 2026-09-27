'use client';

import type { TaxReportKindValue, TaxReportListItem } from '@hms/shared-types';
import { Button, cn } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

import { TaxReportStatusBadge } from '#components/client/taxes/tax-report-status-badge';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatTaxReportPeriod } from '#lib/taxes/format-tax-report-period';
import { useCreateTaxReport } from '#lib/taxes/use-create-tax-report';

type TaxReportMonthCellProps = {
  period: string;
  kind: TaxReportKindValue;
  report?: TaxReportListItem;
  canWrite: boolean;
  isFuture: boolean;
};

/**
 * One month of one report (P27-T05): not yet drafted, a draft, final, or final
 * but no longer matching the books. A drafted month opens its detail page.
 */
export function TaxReportMonthCell({
  period,
  kind,
  report,
  canWrite,
  isFuture,
}: TaxReportMonthCellProps) {
  const t = useTranslations('operations.taxes.reports');
  const locale = useLocale();
  const { createReport, isPending } = useCreateTaxReport({ period, kind });
  const label = formatTaxReportPeriod(period, locale);

  if (!report) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-slate-200 p-3',
          isFuture && 'opacity-50',
        )}
      >
        <p className="text-xs font-medium text-slate-700">{label}</p>
        {canWrite && !isFuture ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 w-full"
            disabled={isPending}
            onClick={() => void createReport()}
          >
            {t('create')}
          </Button>
        ) : (
          <p className="mt-2 text-xs text-slate-400">{t('status.NONE')}</p>
        )}
      </div>
    );
  }
  return (
    <Link
      href={`/admin/taxes/reports/${report.id}`}
      className="block rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
    >
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{formatRupiah(report.taxDue)}</p>
      <TaxReportStatusBadge report={report} className="mt-1" />
    </Link>
  );
}
