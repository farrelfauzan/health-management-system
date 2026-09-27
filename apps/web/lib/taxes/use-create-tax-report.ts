'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTaxReportInput, TaxReportKindValue, TaxReportView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { notifyApiError } from '#lib/api/notify-api-error';
import { notifyStatement } from '#lib/api/notify-statement';
import { parseApiSuccess } from '#lib/api/response';
import { taxReportControllerCreateReportV1 } from '#lib/api/generated/tax-reports/tax-reports';
import { invalidateTaxReportQueries } from '#lib/taxes/invalidate-tax-report-queries';
import { resolveTaxReportErrorCode } from '#lib/taxes/resolve-tax-report-error-code';

type UseCreateTaxReportOptions = {
  period: string;
  kind: TaxReportKindValue;
};

type UseCreateTaxReportResult = {
  createReport: () => Promise<void>;
  isPending: boolean;
};

/**
 * Drafts one month of one report (P27-T05) and opens it, shared by the month
 * card and the table row so both views create and report errors the same way.
 */
export function useCreateTaxReport({
  period,
  kind,
}: UseCreateTaxReportOptions): UseCreateTaxReportResult {
  const t = useTranslations('operations.taxes.reports');
  const router = useRouter();
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (payload: CreateTaxReportInput) => taxReportControllerCreateReportV1(payload),
  });

  async function createReport(): Promise<void> {
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

  return { createReport, isPending: createMutation.isPending };
}
