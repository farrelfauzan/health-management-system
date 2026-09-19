'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaxReportView } from '@hms/shared-types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Skeleton,
  toast,
  useAbility,
} from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxReportDifferencesNotice } from '#components/client/taxes/tax-report-differences-notice';
import { TaxReportLinesTable } from '#components/client/taxes/tax-report-lines-table';
import { TaxReportPp55Summary } from '#components/client/taxes/tax-report-pp55-summary';
import { TaxReportPpnSummary } from '#components/client/taxes/tax-report-ppn-summary';
import {
  taxReportControllerFinalizeReportV1,
  taxReportControllerRecomputeReportV1,
} from '#lib/api/generated/tax-reports/tax-reports';
import { notifyApiError } from '#lib/api/notify-api-error';
import { notifyStatement } from '#lib/api/notify-statement';
import { parseApiSuccess } from '#lib/api/response';
import { exportTaxReport } from '#lib/taxes/export-tax-report';
import { formatTaxReportPeriod } from '#lib/taxes/format-tax-report-period';
import { invalidateTaxReportQueries } from '#lib/taxes/invalidate-tax-report-queries';
import { resolveTaxReportErrorCode } from '#lib/taxes/resolve-tax-report-error-code';
import { useTaxReport } from '#lib/taxes/use-tax-report';

type TaxReportDetailProps = {
  reportId: string;
};

/**
 * One monthly tax report (P27-T05): the figures, what they came from, and —
 * for a finalized report — what has changed in the books since. A draft is
 * recomputed or finalized here; either can be exported as CSV.
 */
export function TaxReportDetail({ reportId }: TaxReportDetailProps) {
  const t = useTranslations('operations.taxes.reports');
  const locale = useLocale();
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canWrite = ability.can('write', 'TaxReport');
  const { report, isPending, isError } = useTaxReport(reportId);
  const recomputeMutation = useMutation({
    mutationFn: () => taxReportControllerRecomputeReportV1(reportId),
  });
  const finalizeMutation = useMutation({
    mutationFn: () => taxReportControllerFinalizeReportV1(reportId),
  });
  const isBusy = recomputeMutation.isPending || finalizeMutation.isPending;

  async function runAction(action: 'recompute' | 'finalize'): Promise<void> {
    try {
      const mutation = action === 'recompute' ? recomputeMutation : finalizeMutation;
      parseApiSuccess<TaxReportView>(await mutation.mutateAsync(), t('saveError'));
      await invalidateTaxReportQueries(queryClient);
      toast.success(t(action === 'recompute' ? 'recomputed' : 'finalized'));
    } catch (caughtError) {
      const code = resolveTaxReportErrorCode(caughtError);
      if (code) {
        notifyStatement({ tone: 'error', title: t(`errors.${code}`) });
        return;
      }
      notifyApiError(caughtError, t('saveError'));
    }
  }

  async function handleExport(current: TaxReportView): Promise<void> {
    try {
      await exportTaxReport({ reportId, period: current.period, kind: current.kind });
    } catch (caughtError) {
      notifyApiError(caughtError, t('exportError'));
    }
  }

  if (isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (isError || !report) {
    return <InlineNotice tone="error">{t('loadError')}</InlineNotice>;
  }
  return (
    <div className="space-y-4">
      <Link href="/admin/taxes" className="inline-flex items-center gap-1 text-sm text-primary">
        <Icon name="arrow_back" size={16} />
        {t('back')}
      </Link>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>
                {t(`kind.${report.kind}`)} · {formatTaxReportPeriod(report.period, locale)}
              </CardTitle>
              <CardDescription>
                <Badge variant={report.status === 'FINALIZED' ? 'default' : 'outline'}>
                  {t(`status.${report.status}`)}
                </Badge>
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {canWrite && report.status === 'DRAFT' ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void runAction('recompute')}
                  >
                    {t('recompute')}
                  </Button>
                  <Button
                    type="button"
                    className="bg-primary-container hover:bg-primary"
                    disabled={isBusy}
                    onClick={() => void runAction('finalize')}
                  >
                    {t('finalize')}
                  </Button>
                </>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void handleExport(report)}>
                <Icon name="download" size={18} />
                {t('exportCsv')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <InlineNotice tone="info">{t('draftBanner')}</InlineNotice>
          <TaxReportDifferencesNotice report={report} />
          {report.summary.kind === 'PP55_OMZET' ? (
            <TaxReportPp55Summary summary={report.summary} />
          ) : (
            <TaxReportPpnSummary summary={report.summary} />
          )}
          <TaxReportLinesTable report={report} />
        </CardContent>
      </Card>
    </div>
  );
}
