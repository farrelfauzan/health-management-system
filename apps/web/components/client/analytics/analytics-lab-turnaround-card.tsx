'use client';

import type { AnalyticsLaboratoryTest } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { useTurnaroundLabel } from '#lib/analytics/use-turnaround-label';

type AnalyticsLabTurnaroundCardProps = {
  tests: AnalyticsLaboratoryTest[];
};

/**
 * The ten tests ordered most, with how long their orders took from order to
 * release. A test with nothing released yet says so instead of a time.
 */
export function AnalyticsLabTurnaroundCard({ tests }: AnalyticsLabTurnaroundCardProps) {
  const t = useTranslations('analytics.laboratory.tests');
  const format = useFormatter();
  const turnaround = useTurnaroundLabel();
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-[3_1_0]">
      {tests.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('test')}</TableHead>
              <TableHead className="text-right">{t('orders')}</TableHead>
              <TableHead className="text-right">{t('median')}</TableHead>
              <TableHead className="text-right">{t('p90')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tests.map((row) => (
              <TableRow key={row.labTestId}>
                <TableCell className="max-w-[240px] truncate">{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {format.number(row.orders)}
                </TableCell>
                {row.releasedOrders === 0 ? (
                  <TableCell colSpan={2} className="text-right text-slate-500">
                    {t('pending')}
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                      {turnaround(row.medianTurnaroundMinutes)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-slate-500 tabular-nums">
                      {turnaround(row.p90TurnaroundMinutes)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AnalyticsCard>
  );
}
