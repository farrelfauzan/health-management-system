'use client';

import { computeChangePercent, type AnalyticsRevenueByDoctor } from '@hms/shared-types';
import { cn, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { formatRupiah } from '#lib/analytics/format-rupiah';
import { formatSignedNumber } from '#lib/analytics/format-signed-number';

type AnalyticsRevenueByDoctorCardProps = {
  doctors: AnalyticsRevenueByDoctor[];
  /** The comparison period's name for the column header; absent without `compare`. */
  previousLabel?: string;
};

/**
 * Revenue per clinician, credited the way the daily cashier report credits
 * it, with the full rupiah figures a table owes its reader. A bill with no
 * clinician (a walk-in lab test, an inpatient stay) reads "Tanpa dokter".
 */
export function AnalyticsRevenueByDoctorCard({
  doctors,
  previousLabel,
}: AnalyticsRevenueByDoctorCardProps) {
  const t = useTranslations('analytics.finance.doctors');
  const format = useFormatter();
  const locale = useLocale();
  function renderChange(row: AnalyticsRevenueByDoctor) {
    const change =
      row.previousRevenue === undefined
        ? null
        : computeChangePercent(row.revenue, row.previousRevenue);
    if (change === null) {
      return '—';
    }
    // Coloured by the figure shown, so a change that rounds to 0% reads neutral.
    const rounded = Math.round(change);
    return (
      <span
        className={cn(
          'font-semibold',
          rounded > 0 && 'text-success',
          rounded < 0 && 'text-danger',
          rounded === 0 && 'text-slate-500',
        )}
      >
        {formatSignedNumber(rounded, locale)}%
      </span>
    );
  }
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')}>
      {doctors.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('doctor')}</TableHead>
              <TableHead>{t('poli')}</TableHead>
              <TableHead className="text-right">{t('visits')}</TableHead>
              <TableHead className="text-right">{t('revenue')}</TableHead>
              <TableHead className="text-right">{t('perVisit')}</TableHead>
              {previousLabel ? (
                <TableHead className="text-right">
                  {t('change', { label: previousLabel })}
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {doctors.map((row) => (
              <TableRow key={row.doctorId ?? 'unattributed'}>
                <TableCell className={cn(row.doctorId === null && 'text-slate-500')}>
                  {row.doctorName ?? t('unattributed')}
                </TableCell>
                <TableCell className="text-slate-600">{row.specialtyName ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.doctorId === null ? '—' : format.number(row.visits)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatRupiah(row.revenue, locale)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.doctorId === null || row.revenuePerVisit === null
                    ? '—'
                    : formatRupiah(row.revenuePerVisit, locale)}
                </TableCell>
                {previousLabel ? (
                  <TableCell className="text-right tabular-nums">
                    {row.doctorId === null ? '—' : renderChange(row)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AnalyticsCard>
  );
}
