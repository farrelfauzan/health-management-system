'use client';

import type { AnalyticsPracticeData } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { formatRupiah } from '#lib/analytics/format-rupiah';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';

type AnalyticsPracticeFeesCardProps = {
  practice: AnalyticsPracticeData;
};

/**
 * The clinician's own gross jasa medis fee in the period (P29-T18, Q-4),
 * with the comparison period's and a line per ledger month. The line-by-line
 * statement stays with the clinic admin.
 */
export function AnalyticsPracticeFeesCard({ practice }: AnalyticsPracticeFeesCardProps) {
  const t = useTranslations('analytics.practice.fees');
  const format = useFormatter();
  const locale = useLocale();
  const { grossFee } = practice.totals;
  const previous = practice.comparison?.totals.grossFee;
  const delta =
    previous === undefined
      ? null
      : resolveAnalyticsDelta({
          current: grossFee,
          previous,
          kind: 'percent',
          higherIsBetter: true,
        });
  const months = practice.breakdowns.feesByMonth;
  const monthLabel = (period: string) =>
    format.dateTime(new Date(`${period}-01T00:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1 xl:max-w-[560px]">
      <div className="flex flex-col gap-1.5">
        <span className="text-[30px] font-bold tracking-tight text-slate-900 tabular-nums">
          {formatRupiah(grossFee, locale, { isCompact: true })}
        </span>
        {delta && previous !== undefined ? (
          <AnalyticsDeltaLine
            delta={delta}
            previousLabel={formatRupiah(previous, locale, { isCompact: true })}
          />
        ) : null}
      </div>
      {months.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('month')}</TableHead>
              <TableHead className="text-right">{t('entries')}</TableHead>
              <TableHead className="text-right">{t('amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((row) => (
              <TableRow key={row.period}>
                <TableCell>{monthLabel(row.period)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {format.number(row.entries)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatRupiah(row.grossFee, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="mt-auto text-xs text-slate-400">{t('footnote')}</p>
    </AnalyticsCard>
  );
}
