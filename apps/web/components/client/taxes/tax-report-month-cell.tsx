'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTaxReportInput,
  TaxReportKindValue,
  TaxReportListItem,
  TaxReportView,
} from '@hms/shared-types';
import { Badge, Button, cn } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { notifyApiError } from '#lib/api/notify-api-error';
import { notifyStatement } from '#lib/api/notify-statement';
import { parseApiSuccess } from '#lib/api/response';
import { taxReportControllerCreateReportV1 } from '#lib/api/generated/tax-reports/tax-reports';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatTaxReportPeriod } from '#lib/taxes/format-tax-report-period';
import { invalidateTaxReportQueries } from '#lib/taxes/invalidate-tax-report-queries';
import { resolveTaxReportErrorCode } from '#lib/taxes/resolve-tax-report-error-code';

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (payload: CreateTaxReportInput) => taxReportControllerCreateReportV1(payload),
  });
  const label = formatTaxReportPeriod(period, locale);

  async function handleCreate(): Promise<void> {
    try {
      const created = parseApiSuccess<TaxReportView>(
        await createMutation.mutateAsync({ period, kind }),
        t('saveError'),
      );
      await invalidateTaxReportQueries(queryClient);
      router.push(`/admin/taxes/reports/${created.data.id}`);
    } catch (caughtError) {
      const code = resolveTaxReportErrorCode(caughtError);
      if (code) {
        notifyStatement({ tone: 'error', title: t(`errors.${code}`) });
        return;
      }
      notifyApiError(caughtError, t('saveError'));
    }
  }

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
            disabled={createMutation.isPending}
            onClick={() => void handleCreate()}
          >
            {t('create')}
          </Button>
        ) : (
          <p className="mt-2 text-xs text-slate-400">{t('status.NONE')}</p>
        )}
      </div>
    );
  }
  const statusKey =
    report.isOutOfDate && report.status === 'FINALIZED' ? 'OUT_OF_DATE' : report.status;
  return (
    <Link
      href={`/admin/taxes/reports/${report.id}`}
      className="block rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
    >
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{formatRupiah(report.taxDue)}</p>
      <Badge
        className="mt-1"
        variant={
          statusKey === 'FINALIZED'
            ? 'default'
            : statusKey === 'OUT_OF_DATE'
              ? 'destructive'
              : 'outline'
        }
      >
        {t(`status.${statusKey}`)}
      </Badge>
    </Link>
  );
}
