'use client';

import type { AnalyticsCaseMixPoliCoding, AnalyticsCaseMixTotals } from '@hms/shared-types';
import { Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsClinicalCount } from '#components/client/analytics/analytics-clinical-count';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { buildEncountersSearchParams } from '#lib/encounters/search-params';

type AnalyticsCodingCompletenessCardProps = {
  totals: AnalyticsCaseMixTotals;
  codingByPoli: AnalyticsCaseMixPoliCoding[];
  filter: AnalyticsFilterState;
};

const ENCOUNTERS_PAGE_SIZE = 10;

/**
 * How completely the period's finished encounters are coded, overall and by
 * poli, with a link to exactly the uncoded ones: an encounter without a coded
 * primary diagnosis cannot be sent to SATUSEHAT or BPJS.
 */
export function AnalyticsCodingCompletenessCard({
  totals,
  codingByPoli,
  filter,
}: AnalyticsCodingCompletenessCardProps) {
  const t = useTranslations('analytics.caseMix.coding');
  const format = useFormatter();
  const href = `/admin/encounters?${buildEncountersSearchParams({
    page: 1,
    limit: ENCOUNTERS_PAGE_SIZE,
    status: 'FINISHED',
    doctorId: filter.doctorId,
    startedFrom: filter.from,
    startedTo: filter.to,
    isUncoded: true,
  }).toString()}`;
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle')}
      className="flex-1 xl:max-w-[420px] xl:min-w-[340px]"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[30px] font-bold tracking-tight text-slate-900 tabular-nums">
          {totals.codingCompletenessPercent === null
            ? '—'
            : `${format.number(totals.codingCompletenessPercent, { maximumFractionDigits: 1 })}%`}
        </span>
        <span className="text-[13px] text-slate-500">
          {t('ofTotal', {
            coded: format.number(totals.codedEncounters),
            finished: format.number(totals.finishedEncounters),
          })}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('poli')}</TableHead>
            <TableHead className="text-right">{t('uncoded')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {codingByPoli.map((row) => (
            <TableRow key={row.specialtyId ?? 'none'}>
              <TableCell>{row.specialtyName ?? t('noPoli')}</TableCell>
              <TableCell className="text-right tabular-nums">
                <AnalyticsClinicalCount count={row.uncodedEncounters} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Link
        href={href}
        className="flex items-center gap-1 self-start text-[13px] font-semibold text-primary"
      >
        {t('link')}
        <Icon name="arrow_forward" size={16} />
      </Link>
    </AnalyticsCard>
  );
}
