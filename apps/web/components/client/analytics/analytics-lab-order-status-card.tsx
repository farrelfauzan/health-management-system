'use client';

import type { AnalyticsLaboratoryData } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { buildShareSegments } from '#lib/analytics/build-share-segments';
import { LAB_ORDER_OUTCOMES } from '#lib/analytics/lab-order-outcome';
import { LAB_ORDER_STATUS_COLORS } from '#lib/analytics/lab-order-status-colors';

type AnalyticsLabOrderStatusCardProps = {
  laboratory: AnalyticsLaboratoryData;
};

/**
 * The period's orders by the status they have now, as one bar with each
 * count underneath, then where the orders came from. An outcome with no
 * orders is left out of the key unless it is one of the usual three.
 */
export function AnalyticsLabOrderStatusCard({ laboratory }: AnalyticsLabOrderStatusCardProps) {
  const t = useTranslations('analytics.laboratory.status');
  const format = useFormatter();
  const { totals } = laboratory;
  const outcomes = LAB_ORDER_OUTCOMES.filter(
    (outcome) => outcome !== 'sentOut' || totals.sentOut > 0,
  );
  const segments = buildShareSegments(
    outcomes.map((outcome) => ({
      key: outcome,
      label: t(`statuses.${outcome}`),
      value: totals[outcome],
      color: LAB_ORDER_STATUS_COLORS[outcome],
    })),
  );
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-[2_1_0]">
      {totals.orders === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-5">
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
            <ul className="flex flex-col gap-2">
              {outcomes.map((outcome) => (
                <li key={outcome} className="flex items-center gap-2 text-[13px] text-slate-900">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2.5 rounded-[3px]',
                      LAB_ORDER_STATUS_COLORS[outcome].swatchClassName,
                    )}
                  />
                  <span className="grow">{t(`statuses.${outcome}`)}</span>
                  <strong className="font-semibold tabular-nums">
                    {format.number(totals[outcome])}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
            <h3 className="text-[13px] font-semibold text-slate-900">{t('sourcesTitle')}</h3>
            <ul className="flex flex-col gap-2">
              {laboratory.breakdowns.sources.map((row) => (
                <li
                  key={row.source}
                  className="flex items-center justify-between text-[13px] text-slate-900"
                >
                  {t(`sources.${row.source}`)}
                  <strong className="font-semibold tabular-nums">
                    {format.number(row.orders)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AnalyticsCard>
  );
}
