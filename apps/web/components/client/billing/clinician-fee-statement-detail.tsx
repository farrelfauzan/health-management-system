'use client';

import { useMutation } from '@tanstack/react-query';
import { Button, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicianFeeEntriesTable } from '#components/client/billing/clinician-fee-entries-table';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { notifyApiError } from '#lib/api/notify-api-error';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { exportClinicianFeeStatement } from '#lib/clinician-fees/export-clinician-fee-statement';
import { useClinicianFeeStatement } from '#lib/clinician-fees/use-clinician-fee-statement';

type ClinicianFeeStatementDetailProps = {
  doctorId: string;
  period: string;
  onBack: () => void;
};

/** One clinician's monthly jasa medis lines and totals, with a CSV export. */
export function ClinicianFeeStatementDetail({
  doctorId,
  period,
  onBack,
}: ClinicianFeeStatementDetailProps) {
  const t = useTranslations('operations.billing.fees.statements');
  const { statement, isPending, isError } = useClinicianFeeStatement({ doctorId, period });
  const exportMutation = useMutation({ mutationFn: exportClinicianFeeStatement });

  if (isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (isError || !statement) {
    return <InlineNotice tone="error">{t('loadError')}</InlineNotice>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <Icon name="arrow_back" size={18} />
          {t('back')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={exportMutation.isPending}
          onClick={() =>
            exportMutation.mutate(
              { doctorId, period, doctorName: statement.doctorName },
              { onError: (caughtError) => notifyApiError(caughtError, t('exportError')) },
            )
          }
        >
          <Icon name="download" size={18} />
          {t('exportCsv')}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">{statement.doctorName}</p>
          <p className="text-sm text-slate-600">
            {t('lineAmount')}: {formatRupiah(statement.totals.lineAmount)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">{t('grossFee')}</p>
          <p className="font-heading text-lg font-semibold text-slate-900">
            {formatRupiah(statement.totals.grossFee)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">{t('clinicShare')}</p>
          <p className="font-heading text-lg font-semibold text-slate-900">
            {formatRupiah(statement.totals.clinicShare)}
          </p>
        </div>
      </div>
      <ClinicianFeeEntriesTable entries={statement.entries} />
    </div>
  );
}
