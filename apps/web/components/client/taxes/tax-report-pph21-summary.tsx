'use client';

import type { Pph21ReportSummary } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { formatRupiah } from '#lib/billing/format-rupiah';

type TaxReportPph21SummaryProps = {
  summary: Pph21ReportSummary;
};

/**
 * The PPh 21 bukan pegawai month at a glance (P27-T07): gross clinician fees,
 * the 50% base, the PPh 21 withheld, the billing code and both due dates.
 * A recipient with no tax identity is called out here because it blocks
 * finalizing the month.
 */
export function TaxReportPph21Summary({ summary }: TaxReportPph21SummaryProps) {
  const t = useTranslations('operations.taxes.reports.pph21');
  const rows: Array<[string, string]> = [
    [t('grossFee'), formatRupiah(summary.totals.grossFee)],
    [t('dpp', { percent: summary.dppPercent }), formatRupiah(summary.totals.taxBase)],
    [t('bracketsEffectiveFrom'), summary.bracketsEffectiveFrom],
    [t('billingCode'), `${summary.taxAccountCode}-${summary.depositTypeCode}`],
    [t('paymentDueDate'), summary.paymentDueDate],
    [t('reportingDueDate'), summary.reportingDueDate],
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900 sm:text-left">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-lg bg-primary/5 p-4 text-right sm:min-w-56">
          <p className="text-xs text-slate-500">{t('taxAmount')}</p>
          <p className="font-heading text-2xl font-semibold text-slate-900">
            {formatRupiah(summary.totals.taxAmount)}
          </p>
          <p className="text-xs text-slate-500">
            {t('clinicianCount', { count: summary.clinicianCount })}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500">{t('nonCumulative')}</p>
      {summary.incompleteIdentityCount > 0 ? (
        <InlineNotice tone="warning">
          {t('incompleteIdentity', { count: summary.incompleteIdentityCount })}
        </InlineNotice>
      ) : null}
    </div>
  );
}
