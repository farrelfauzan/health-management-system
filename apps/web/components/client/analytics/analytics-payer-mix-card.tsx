'use client';

import type { AnalyticsRevenueByPayer } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsShareBar } from '#components/client/analytics/analytics-share-bar';
import type { AnalyticsShareSegment } from '#lib/analytics/analytics-filter-state';
import { buildShareSegments } from '#lib/analytics/build-share-segments';
import { PAYER_TYPE_COLORS } from '#lib/analytics/payer-type-colors';

type AnalyticsPayerMixCardProps = {
  payers: AnalyticsRevenueByPayer[];
};

const NOT_RECORDED = 'notRecorded' as const;

/**
 * Who pays, as a share of visits and of revenue (P29-T07). A visit whose
 * payer was never asked is "Tidak tercatat", and when there is any the card
 * says why rather than leaving the grey slice to be guessed at.
 */
export function AnalyticsPayerMixCard({ payers }: AnalyticsPayerMixCardProps) {
  const t = useTranslations('analytics.finance.payers');
  function buildSegments(pick: (row: AnalyticsRevenueByPayer) => number): AnalyticsShareSegment[] {
    return buildShareSegments(
      payers.map((row) => {
        const key = row.payerType ?? NOT_RECORDED;
        return {
          key,
          label: t(`names.${key}`),
          value: pick(row),
          color: PAYER_TYPE_COLORS[key],
        };
      }),
    );
  }
  const visitSegments = buildSegments((row) => row.visits);
  const revenueSegments = buildSegments((row) => row.revenue);
  const describe = (metric: string, segments: AnalyticsShareSegment[]) =>
    t('ariaLabel', {
      metric,
      shares: segments.map((segment) => `${segment.label} ${segment.percent}%`).join(', '),
    });
  const hasUnrecorded = payers.some(
    (row) => row.payerType === null && (row.visits > 0 || row.revenue > 0),
  );
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1">
      <div className="flex flex-col gap-3.5">
        <AnalyticsShareBar
          label={t('visits')}
          segments={visitSegments}
          ariaLabel={describe(t('visits'), visitSegments)}
        />
        <AnalyticsShareBar
          label={t('revenue')}
          segments={revenueSegments}
          ariaLabel={describe(t('revenue'), revenueSegments)}
        />
        {hasUnrecorded ? (
          <p className="flex items-start gap-2 rounded-[10px] bg-surface-container-low px-3 py-2.5 text-xs text-on-surface-variant">
            <Icon name="info" size={16} className="shrink-0 text-primary" />
            {t('notRecordedNote')}
          </p>
        ) : null}
      </div>
    </AnalyticsCard>
  );
}
