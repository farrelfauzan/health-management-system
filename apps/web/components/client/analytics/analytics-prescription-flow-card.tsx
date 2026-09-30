'use client';

import type { AnalyticsPharmacyTotals } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { buildShareSegments } from '#lib/analytics/build-share-segments';
import { PRESCRIPTION_FLOW_COLORS } from '#lib/analytics/prescription-flow-colors';
import { PRESCRIPTION_FLOW_STATUSES } from '#lib/analytics/prescription-flow-status';

type AnalyticsPrescriptionFlowCardProps = {
  totals: AnalyticsPharmacyTotals;
};

/**
 * The period's prescriptions split by the status they have now, as one bar
 * with each outcome's count underneath. The five outcomes add up to every
 * prescription issued.
 */
export function AnalyticsPrescriptionFlowCard({ totals }: AnalyticsPrescriptionFlowCardProps) {
  const t = useTranslations('analytics.pharmacy.flow');
  const format = useFormatter();
  const segments = buildShareSegments(
    PRESCRIPTION_FLOW_STATUSES.map((status) => ({
      key: status,
      label: t(`statuses.${status}`),
      value: totals[status],
      color: PRESCRIPTION_FLOW_COLORS[status],
    })),
  );
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1">
      {totals.prescriptionsIssued === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            role="img"
            aria-label={t('ariaLabel')}
            className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-surface-container-low"
          >
            {segments
              .filter((segment) => segment.percent > 0)
              .map((segment) => (
                <span
                  key={segment.key}
                  className={cn('h-full', segment.color.swatchClassName)}
                  style={{ width: `${segment.percent}%` }}
                />
              ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {PRESCRIPTION_FLOW_STATUSES.map((status) => (
              <li key={status} className="flex items-center gap-2 text-[13px] text-slate-900">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2.5 rounded-[3px]',
                    PRESCRIPTION_FLOW_COLORS[status].swatchClassName,
                  )}
                />
                {t(`statuses.${status}`)}
                <strong className="font-semibold tabular-nums">
                  {format.number(totals[status])}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AnalyticsCard>
  );
}
