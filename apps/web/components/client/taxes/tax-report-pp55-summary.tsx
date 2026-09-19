'use client';

import type { Pp55ReportSummary } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';

type TaxReportPp55SummaryProps = {
  summary: Pp55ReportSummary;
};

/**
 * The PP 55 month at a glance (P27-T05): omzet, the individual allowance used,
 * the PPh final due, the billing code and the day it must be paid.
 */
export function TaxReportPp55Summary({ summary }: TaxReportPp55SummaryProps) {
  const t = useTranslations('operations.taxes.reports.pp55');
  const rows: Array<[string, string]> = [
    [t('grossOmzet'), formatRupiah(summary.totals.grossOmzet)],
    [t('yearToDateOmzetBefore'), formatRupiah(summary.yearToDateOmzetBefore)],
    [t('nonTaxableAllowanceUsed'), formatRupiah(summary.nonTaxableAllowanceUsed)],
    [t('taxableOmzet'), formatRupiah(summary.totals.taxableOmzet)],
    [t('rate'), `${summary.ratePercent.toLocaleString('id-ID')}%`],
    [t('billingCode'), `${summary.taxAccountCode}-${summary.depositTypeCode}`],
    [t('paymentDueDate'), summary.paymentDueDate],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-900 sm:text-left">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-lg bg-slate-50 p-4 text-right">
        <p className="text-xs text-slate-500">{t('taxDue')}</p>
        <p className="font-heading text-2xl font-semibold text-slate-900">
          {formatRupiah(summary.totals.taxDue)}
        </p>
        <p className="text-xs text-slate-500">
          {t('paymentCount', { count: summary.paymentCount })}
        </p>
      </div>
    </div>
  );
}
